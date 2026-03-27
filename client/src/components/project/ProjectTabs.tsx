import { useState, useEffect, useRef, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/use-organization";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useUpdateProject } from "@/hooks/use-projects";
import { useIssues, useCreateIssue, useUpdateIssue, useDeleteIssue, useIssueHistory } from "@/hooks/use-issues";
import { useIssueResourceAssignments, useUpdateIssueResourceAssignments } from "@/hooks/use-resources";
import { useProjectFinancials, useCreateProjectFinancial, useUpdateProjectFinancial, useDeleteProjectFinancial } from "@/hooks/use-project-financials";
import { useChangeRequests, useCreateChangeRequest, useUpdateChangeRequest, useDeleteChangeRequest } from "@/hooks/use-change-requests";
import { useProjectDocuments, useCreateProjectDocument, useUpdateProjectDocument, useDeleteProjectDocument } from "@/hooks/use-project-documents";
import { useScoringCriteria, useCreateScoringCriteria, useUpdateScoringCriteria, useDeleteScoringCriteria, useProjectScores, useSaveProjectScore, useProjectBenefits, useCreateProjectBenefit, useUpdateProjectBenefit, useDeleteProjectBenefit, useProjectDecisions, useCreateProjectDecision, useUpdateProjectDecision, useDeleteProjectDecision } from "@/hooks/use-project-features";
import { useLessonsLearned, useCreateLessonLearned, useUpdateLessonLearned, useDeleteLessonLearned } from "@/hooks/use-lessons-learned";
import { insertIssueSchema } from "@shared/schema";
import type { Issue, ProjectFinancial, ChangeRequest, ProjectDocument, Risk, Task, ProjectInvoice, InvoiceNote } from "@shared/schema";
import { ResourceAssignment } from "@/components/ResourceAssignment";
import { ProjectStatusReport } from "@/components/ProjectStatusReport";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Loader2, Plus, Trash2, Bug, Sparkles, ListTodo, HelpCircle, FileText, Pencil, Check, X,
  LayoutGrid, History, MoreVertical, CheckSquare, Clock, DollarSign, ClipboardList,
  FolderOpen, Download, Upload, Eye, Share2, Mail, ArrowUpToLine, CloudDownload, RefreshCw, MessageCircle, Search, Link as LinkIcon,
  ChevronDown, ChevronUp
} from "lucide-react";

const issuePriorityColors = {
  Low: "bg-slate-100 text-slate-700",
  Medium: "bg-blue-100 text-blue-700",
  High: "bg-amber-100 text-amber-700",
  Critical: "bg-rose-100 text-rose-700",
};

const issueStatusColors = {
  Open: "bg-red-100 text-red-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Resolved: "bg-emerald-100 text-emerald-700",
  Closed: "bg-slate-100 text-slate-700",
};

const typeIcons = {
  Bug: Bug,
  Enhancement: Sparkles,
  Task: ListTodo,
  Question: HelpCircle,
};

export function IssuesTab({ projectId, projectName, portfolioId, urlIssueId, readOnly = false }: { projectId: number; projectName?: string; portfolioId?: number | null; urlIssueId?: string | null; readOnly?: boolean }) {
  const { currentOrganization } = useOrganization();
  const { data: issues, isLoading } = useIssues(projectId);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const portfolioName = portfolioId ? portfolios?.find(p => p.id === portfolioId)?.name : undefined;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [deleteIssueData, setDeleteIssueData] = useState<Issue | null>(null);
  const [historyIssueId, setHistoryIssueId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [escalateToPortfolio, setEscalateToPortfolio] = useState(false);
  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const updateIssueResources = useUpdateIssueResourceAssignments();
  const { data: issueAssignments } = useIssueResourceAssignments(editingIssue?.id ?? null);
  const { data: issueHistory, isLoading: historyLoading } = useIssueHistory(editingIssue?.id || 0);
  const { toast } = useToast();
  
  useEffect(() => {
    if (issueAssignments && editingIssue) {
      setSelectedResourceIds(issueAssignments.map(a => a.resourceId));
    }
  }, [issueAssignments, editingIssue]);

  const issueAutoOpenRef = useRef(false);

  const form = useForm({
    resolver: zodResolver(insertIssueSchema),
    defaultValues: {
      projectId,
      title: "",
      description: "",
      priority: "Medium",
      status: "Open",
      type: "Bug",
      assignee: "",
      dueDate: "",
      impactCost: "",
    }
  });

  const openEditDialog = (issue: Issue) => {
    setEditingIssue(issue);
    setShowHistory(false);
    setEscalateToPortfolio(issue.escalatedToPortfolio || false);
    form.reset({
      projectId: issue.projectId,
      title: issue.title,
      description: issue.description || "",
      priority: issue.priority || "Medium",
      status: issue.status || "Open",
      type: issue.type || "Bug",
      assignee: issue.assignee || "",
      dueDate: issue.dueDate ? issue.dueDate.split("T")[0] : "",
      impactCost: issue.impactCost ? String(issue.impactCost) : "",
    });
    setIsDialogOpen(true);
  };

  useEffect(() => {
    if (urlIssueId && issues && issues.length > 0 && !issueAutoOpenRef.current) {
      const issueId = parseInt(urlIssueId);
      const issue = issues.find(i => i.id === issueId);
      if (issue) {
        openEditDialog(issue);
        issueAutoOpenRef.current = true;
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('issueId');
        window.history.replaceState({}, '', newUrl.toString());
      }
    }
  }, [urlIssueId, issues]);

  const openCreateDialog = () => {
    setEditingIssue(null);
    setShowHistory(false);
    setSelectedResourceIds([]);
    setEscalateToPortfolio(false);
    form.reset({
      projectId,
      title: "",
      description: "",
      priority: "Medium",
      status: "Open",
      type: "Bug",
      assignee: "",
      dueDate: "",
      impactCost: "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (rawData: any) => {
    const data = { ...rawData };
    if (!data.dueDate) delete data.dueDate;
    if (!data.impactCost) delete data.impactCost;
    const escalationData = escalateToPortfolio 
      ? { escalatedToPortfolio: true, escalatedAt: editingIssue?.escalatedToPortfolio ? editingIssue.escalatedAt : new Date().toISOString() }
      : { escalatedToPortfolio: false, escalatedAt: null };
    
    if (editingIssue) {
      updateIssue.mutate({ id: editingIssue.id, projectId, ...data, ...escalationData }, {
        onSuccess: () => {
          updateIssueResources.mutate({ issueId: editingIssue.id, resourceIds: selectedResourceIds });
          toast({ title: "Success", description: "Issue updated" });
          setIsDialogOpen(false);
          setEditingIssue(null);
        },
        onError: (error: any) => {
          toast({ title: "Error", description: error?.message || "Failed to update issue", variant: "destructive" });
        }
      });
    } else {
      createIssue.mutate({ ...data, ...escalationData }, {
        onSuccess: (newIssue: any) => {
          if (selectedResourceIds.length > 0 && newIssue?.id) {
            updateIssueResources.mutate({ issueId: newIssue.id, resourceIds: selectedResourceIds });
          }
          toast({ title: "Success", description: "Issue created" });
          setIsDialogOpen(false);
        }
      });
    }
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Project Issues</CardTitle>
          <CardDescription>Track bugs, tasks, and enhancements.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingIssue(null); }}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreateDialog} disabled={readOnly} data-testid="button-add-issue"><Plus className="mr-2 h-4 w-4" /> Add Issue</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{editingIssue ? "Edit Issue" : "Add New Issue"}</DialogTitle>
              <DialogDescription>{editingIssue ? "Modify the issue details below." : "Create a new bug, task, or enhancement."}</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
              <div className="space-y-4 pt-4 flex-1 overflow-y-auto px-1">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...form.register("title")} data-testid="input-issue-title" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Controller control={form.control} name="type" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value || "Bug"}>
                       <SelectTrigger data-testid="select-issue-type"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Bug">Bug</SelectItem>
                         <SelectItem value="Enhancement">Enhancement</SelectItem>
                         <SelectItem value="Task">Task</SelectItem>
                         <SelectItem value="Question">Question</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                   <Controller control={form.control} name="priority" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value || "Medium"}>
                       <SelectTrigger data-testid="select-issue-priority"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Low">Low</SelectItem>
                         <SelectItem value="Medium">Medium</SelectItem>
                         <SelectItem value="High">High</SelectItem>
                         <SelectItem value="Critical">Critical</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                   <Controller control={form.control} name="status" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value || "Open"}>
                       <SelectTrigger data-testid="select-issue-status"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Open">Open</SelectItem>
                         <SelectItem value="In Progress">In Progress</SelectItem>
                         <SelectItem value="Resolved">Resolved</SelectItem>
                         <SelectItem value="Closed">Closed</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" {...form.register("dueDate")} data-testid="input-issue-due-date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cost Exposure ($)</Label>
                <Input type="number" min="0" step="0.01" {...form.register("impactCost")} data-testid="input-issue-cost-exposure" placeholder="$ amount" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea {...form.register("description")} data-testid="input-issue-description" />
              </div>
              <ResourceAssignment
                organizationId={currentOrganization?.id || null}
                selectedResourceIds={selectedResourceIds}
                onSelectionChange={setSelectedResourceIds}
                label="Assigned Resources"
                projectId={projectId}
                projectName={projectName}
              />
              
              {portfolioId && (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <ArrowUpToLine className="h-4 w-4 text-purple-600" />
                    <div>
                      <Label className="text-sm font-medium">Escalate to Portfolio</Label>
                      <p className="text-xs text-muted-foreground">
                        Make this issue visible in <span className="font-medium text-foreground">{portfolioName || 'portfolio'}</span>
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={escalateToPortfolio}
                    onCheckedChange={setEscalateToPortfolio}
                    data-testid="switch-escalate-issue"
                  />
                </div>
              )}
              {editingIssue?.escalatedToPortfolio && editingIssue.escalatedAt && (
                <p className="text-xs text-muted-foreground">
                  Escalated on {format(new Date(editingIssue.escalatedAt), 'MMM d, yyyy')}
                </p>
              )}

              {editingIssue && (
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
              )}
              </div>

              <DialogFooter className="flex justify-between gap-2 pt-4 border-t mt-4 shrink-0">
                <div>
                  {editingIssue && (
                    <Button 
                      type="button" 
                      variant="destructive" 
                      onClick={() => {
                        deleteIssue.mutate({ id: editingIssue.id, projectId }, {
                          onSuccess: () => {
                            toast({ title: "Deleted", description: "Issue deleted" });
                            setIsDialogOpen(false);
                            setEditingIssue(null);
                          }
                        });
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setEditingIssue(null); }}>Cancel</Button>
                  <Button type="submit" data-testid="button-save-issue" disabled={createIssue.isPending || updateIssue.isPending}>
                    {(createIssue.isPending || updateIssue.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingIssue ? "Update Issue" : "Save Issue"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {issues?.map(issue => {
            const TypeIcon = typeIcons[issue.type as keyof typeof typeIcons] || Bug;
            return (
              <div 
                key={issue.id} 
                className="flex items-start justify-between rounded-lg border p-4 cursor-pointer hover-elevate transition-colors" 
                onClick={() => openEditDialog(issue)}
                data-testid={`card-issue-${issue.id}`}
              >
                <div className="flex gap-3">
                  <div className="mt-0.5">
                    <TypeIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-semibold truncate max-w-[200px]" title={issue.title}>{issue.title}</span>
                      <Badge variant="outline" className={cn("text-xs shrink-0", issuePriorityColors[issue.priority as keyof typeof issuePriorityColors])}>
                        {issue.priority}
                      </Badge>
                      <Badge variant="outline" className={cn("text-xs shrink-0", issueStatusColors[issue.status as keyof typeof issueStatusColors])}>
                        {issue.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2" title={issue.description || ""}>{issue.description}</p>
                    {issue.assignee && <p className="text-xs text-muted-foreground truncate" title={`Assigned to: ${issue.assignee}`}>Assigned to: {issue.assignee}</p>}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`button-menu-issue-${issue.id}`}
                    >
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem 
                      onClick={() => setHistoryIssueId(issue.id)}
                      data-testid={`button-history-issue-${issue.id}`}
                    >
                      <History className="h-4 w-4 mr-2" />
                      View History
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setDeleteIssueData(issue)}
                      data-testid={`button-delete-issue-${issue.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          {issues?.length === 0 && <div className="text-center py-8 text-muted-foreground">No issues recorded.</div>}
        </div>
      </CardContent>

      <Dialog open={deleteIssueData !== null} onOpenChange={(open) => !open && setDeleteIssueData(null)}>
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
                  deleteIssue.mutate({ id: deleteIssueData.id, projectId }, {
                    onSuccess: () => {
                      toast({ title: "Success", description: "Issue moved to recycle bin" });
                      setDeleteIssueData(null);
                    }
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

      <IssueHistoryDialog 
        issueId={historyIssueId || 0} 
        open={historyIssueId !== null} 
        onOpenChange={(open) => !open && setHistoryIssueId(null)} 
      />
    </Card>
  );
}

export function IssueHistoryDialog({ issueId, open, onOpenChange }: { issueId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: history, isLoading } = useIssueHistory(issueId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Issue Change History
          </DialogTitle>
          <DialogDescription>
            View all changes made to this issue over time.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No changes recorded yet
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {history.map((log) => (
                  <div 
                    key={log.id} 
                    className="border-l-2 border-muted-foreground/30 pl-4 pb-4"
                    data-testid={`issue-history-entry-${log.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-xs">
                        {log.changeType === 'created' ? 'Created' : 'Updated'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(String(log.changedAt)), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    <div className="mt-2 text-sm">
                      <span className="font-medium">{log.changedByName}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground break-words">
                      {log.changeSummary}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FinancialsTab({ projectId, readOnly = false }: { projectId: number; readOnly?: boolean }) {
  const { data: financials, isLoading } = useProjectFinancials(projectId);
  const createFinancial = useCreateProjectFinancial(projectId);
  const updateFinancial = useUpdateProjectFinancial(projectId);
  const deleteFinancial = useDeleteProjectFinancial(projectId);
  const { toast } = useToast();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<ProjectFinancial>>({});

  const currentYear = new Date().getFullYear();

  const form = useForm({
    defaultValues: {
      category: "CapEx" as string,
      lineItem: "",
      description: "",
      fiscalYear: currentYear,
      fiscalPeriod: "Full Year",
      budgetAmount: "0",
      plannedAmount: "0",
      actualAmount: "0",
      notes: "",
    }
  });

  const onSubmit = (data: any) => {
    createFinancial.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Financial record added" });
        setShowAddDialog(false);
        form.reset();
      }
    });
  };

  const startEdit = (financial: ProjectFinancial) => {
    setEditingId(financial.id);
    setEditValues({
      budgetAmount: financial.budgetAmount,
      plannedAmount: financial.plannedAmount,
      actualAmount: financial.actualAmount,
      notes: financial.notes,
    });
  };

  const saveEdit = (id: number) => {
    updateFinancial.mutate({ id, ...editValues }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Financial record updated" });
        setEditingId(null);
        setEditValues({});
      }
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const capexItems = financials?.filter(f => f.category === "CapEx") || [];
  const opexItems = financials?.filter(f => f.category === "OpEx") || [];

  const calculateTotals = (items: ProjectFinancial[]) => {
    return items.reduce((acc, item) => ({
      budget: acc.budget + Number(item.budgetAmount || 0),
      planned: acc.planned + Number(item.plannedAmount || 0),
      actual: acc.actual + Number(item.actualAmount || 0),
    }), { budget: 0, planned: 0, actual: 0 });
  };

  const capexTotals = calculateTotals(capexItems);
  const opexTotals = calculateTotals(opexItems);
  const grandTotals = {
    budget: capexTotals.budget + opexTotals.budget,
    planned: capexTotals.planned + opexTotals.planned,
    actual: capexTotals.actual + opexTotals.actual,
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getVariance = (budget: number, actual: number) => {
    const variance = budget - actual;
    const percent = budget > 0 ? (variance / budget) * 100 : 0;
    return { variance, percent };
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Financial Tracking
          </CardTitle>
          <CardDescription>
            Budget, Plan, and Actuals by Capital (CapEx) and Operational (OpEx) expenses
          </CardDescription>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button disabled={readOnly} data-testid="button-add-financial">
              <Plus className="h-4 w-4 mr-2" />
              Add Line Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Financial Line Item</DialogTitle>
              <DialogDescription>Add a new budget/expense line item for this project</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Controller control={form.control} name="category" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="select-financial-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CapEx">Capital (CapEx)</SelectItem>
                        <SelectItem value="OpEx">Operational (OpEx)</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>Fiscal Year</Label>
                  <Controller control={form.control} name="fiscalYear" render={({ field }) => (
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value.toString()}>
                      <SelectTrigger data-testid="select-fiscal-year"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(year => (
                          <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Line Item <span className="text-destructive">*</span></Label>
                  <Input {...form.register("lineItem")} placeholder="e.g., Software Licenses" data-testid="input-line-item" />
                  {form.formState.errors.lineItem && (
                    <p className="text-xs text-destructive">{form.formState.errors.lineItem.message as string || "Line Item is required"}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Period</Label>
                  <Controller control={form.control} name="fiscalPeriod" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "Full Year"}>
                      <SelectTrigger data-testid="select-fiscal-period"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Full Year">Full Year</SelectItem>
                        <SelectItem value="Q1">Q1</SelectItem>
                        <SelectItem value="Q2">Q2</SelectItem>
                        <SelectItem value="Q3">Q3</SelectItem>
                        <SelectItem value="Q4">Q4</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input {...form.register("description")} placeholder="Optional description" data-testid="input-financial-description" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Budget</Label>
                  <Input type="number" {...form.register("budgetAmount")} data-testid="input-budget-amount" />
                </div>
                <div className="space-y-2">
                  <Label>Planned</Label>
                  <Input type="number" {...form.register("plannedAmount")} data-testid="input-planned-amount" />
                </div>
                <div className="space-y-2">
                  <Label>Actual</Label>
                  <Input type="number" {...form.register("actualAmount")} data-testid="input-actual-amount" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input {...form.register("notes")} placeholder="Optional notes" data-testid="input-financial-notes" />
              </div>
              <DialogFooter>
                <Button type="submit" data-testid="button-save-financial" disabled={createFinancial.isPending}>
                  {createFinancial.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">Line Item</th>
                <th className="text-center px-2 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-16">Year</th>
                <th className="text-center px-2 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-20">Period</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-28">Budget</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-28">Planned</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-28">Actual</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-28">Variance</th>
                <th className="w-16 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {capexItems.length > 0 && (
                <>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
                    <td colSpan={8} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      CapEx - Capital Expenditures
                    </td>
                  </tr>
                  {capexItems.map((item) => (
                    <FinancialTableRow
                      key={item.id}
                      item={item}
                      isEditing={editingId === item.id}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      startEdit={startEdit}
                      saveEdit={saveEdit}
                      cancelEdit={cancelEdit}
                      deleteFinancial={deleteFinancial}
                      formatCurrency={formatCurrency}
                      getVariance={getVariance}
                    />
                  ))}
                  <tr className="border-b bg-slate-50/50 dark:bg-slate-800/30">
                    <td colSpan={3} className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">CapEx Subtotal</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(capexTotals.budget)}</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(capexTotals.planned)}</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(capexTotals.actual)}</td>
                    <td className={cn("px-3 py-1.5 text-right text-xs font-medium tabular-nums", capexTotals.budget - capexTotals.actual >= 0 ? "text-slate-700 dark:text-slate-300" : "text-red-600 dark:text-red-400")}>
                      {formatCurrency(capexTotals.budget - capexTotals.actual)}
                    </td>
                    <td className="px-2 py-1.5"></td>
                  </tr>
                </>
              )}
              {opexItems.length > 0 && (
                <>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
                    <td colSpan={8} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      OpEx - Operational Expenditures
                    </td>
                  </tr>
                  {opexItems.map((item) => (
                    <FinancialTableRow
                      key={item.id}
                      item={item}
                      isEditing={editingId === item.id}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      startEdit={startEdit}
                      saveEdit={saveEdit}
                      cancelEdit={cancelEdit}
                      deleteFinancial={deleteFinancial}
                      formatCurrency={formatCurrency}
                      getVariance={getVariance}
                    />
                  ))}
                  <tr className="border-b bg-slate-50/50 dark:bg-slate-800/30">
                    <td colSpan={3} className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">OpEx Subtotal</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(opexTotals.budget)}</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(opexTotals.planned)}</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(opexTotals.actual)}</td>
                    <td className={cn("px-3 py-1.5 text-right text-xs font-medium tabular-nums", opexTotals.budget - opexTotals.actual >= 0 ? "text-slate-700 dark:text-slate-300" : "text-red-600 dark:text-red-400")}>
                      {formatCurrency(opexTotals.budget - opexTotals.actual)}
                    </td>
                    <td className="px-2 py-1.5"></td>
                  </tr>
                </>
              )}
              {capexItems.length === 0 && opexItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No financial items recorded. Add a line item to get started.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-200 dark:bg-slate-700 border-t-2 border-slate-300 dark:border-slate-600">
                <td colSpan={3} className="px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100 text-right">Grand Total</td>
                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(grandTotals.budget)}</td>
                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(grandTotals.planned)}</td>
                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(grandTotals.actual)}</td>
                <td className={cn("px-3 py-2 text-right text-sm font-bold tabular-nums", grandTotals.budget - grandTotals.actual >= 0 ? "text-slate-800 dark:text-slate-100" : "text-red-700 dark:text-red-400")}>
                  {formatCurrency(grandTotals.budget - grandTotals.actual)}
                </td>
                <td className="px-2 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function FinancialTableRow({
  item,
  isEditing,
  editValues,
  setEditValues,
  startEdit,
  saveEdit,
  cancelEdit,
  deleteFinancial,
  formatCurrency,
  getVariance,
}: {
  item: ProjectFinancial;
  isEditing: boolean;
  editValues: Partial<ProjectFinancial>;
  setEditValues: (values: Partial<ProjectFinancial>) => void;
  startEdit: (financial: ProjectFinancial) => void;
  saveEdit: (id: number) => void;
  cancelEdit: () => void;
  deleteFinancial: any;
  formatCurrency: (value: number) => string;
  getVariance: (budget: number, actual: number) => { variance: number; percent: number };
}) {
  const variance = getVariance(Number(item.budgetAmount), Number(item.actualAmount));
  
  return (
    <tr className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-financial-${item.id}`}>
      <td className="px-3 py-2 min-w-0 max-w-[200px] overflow-hidden">
        <div className="text-sm font-medium truncate" title={item.lineItem}>{item.lineItem}</div>
        {item.description && <div className="text-xs text-muted-foreground truncate" title={item.description}>{item.description}</div>}
      </td>
      <td className="px-2 py-2 text-center text-xs tabular-nums">{item.fiscalYear}</td>
      <td className="px-2 py-2 text-center text-xs">{item.fiscalPeriod}</td>
      <td className="px-3 py-2 text-right">
        {isEditing ? (
          <Input
            type="number"
            value={editValues.budgetAmount || ""}
            onChange={(e) => setEditValues({ ...editValues, budgetAmount: e.target.value })}
            className="w-24 h-7 text-xs text-right"
            data-testid="input-edit-budget"
          />
        ) : (
          <span className="text-xs tabular-nums">{formatCurrency(Number(item.budgetAmount))}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {isEditing ? (
          <Input
            type="number"
            value={editValues.plannedAmount || ""}
            onChange={(e) => setEditValues({ ...editValues, plannedAmount: e.target.value })}
            className="w-24 h-7 text-xs text-right"
            data-testid="input-edit-planned"
          />
        ) : (
          <span className="text-xs tabular-nums">{formatCurrency(Number(item.plannedAmount))}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {isEditing ? (
          <Input
            type="number"
            value={editValues.actualAmount || ""}
            onChange={(e) => setEditValues({ ...editValues, actualAmount: e.target.value })}
            className="w-24 h-7 text-xs text-right"
            data-testid="input-edit-actual"
          />
        ) : (
          <span className="text-xs tabular-nums">{formatCurrency(Number(item.actualAmount))}</span>
        )}
      </td>
      <td className={cn(
        "px-3 py-2 text-right text-xs tabular-nums",
        variance.variance >= 0 ? "text-slate-700 dark:text-slate-300" : "text-red-600 dark:text-red-400"
      )}>
        {formatCurrency(variance.variance)}
        <span className="text-[10px] ml-0.5 text-muted-foreground">({variance.percent.toFixed(0)}%)</span>
      </td>
      <td className="px-2 py-2">
        <div className="flex justify-end gap-0.5">
          {isEditing ? (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveEdit(item.id)} data-testid="button-save-edit">
                <Check className="h-3 w-3 text-green-600" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEdit} data-testid="button-cancel-edit">
                <X className="h-3 w-3 text-slate-400" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(item)} data-testid={`button-edit-financial-${item.id}`}>
                <Pencil className="h-3 w-3 text-slate-400" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-6 w-6"
                onClick={() => deleteFinancial.mutate(item.id)}
                data-testid={`button-delete-financial-${item.id}`}
              >
                <Trash2 className="h-3 w-3 text-slate-400" />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export function ChangeRequestsTab({ projectId }: { projectId: number }) {
  const { data: changeRequests, isLoading } = useChangeRequests(projectId);
  const createChangeRequest = useCreateChangeRequest(projectId);
  const updateChangeRequest = useUpdateChangeRequest(projectId);
  const deleteChangeRequest = useDeleteChangeRequest(projectId);
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<ChangeRequest | null>(null);
  const [limitError, setLimitError] = useState<{ resourceType: string; message?: string } | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'Scope' as 'Scope' | 'Schedule' | 'Budget' | 'Resource' | 'Other',
    priority: 'Medium' as 'Low' | 'Medium' | 'High' | 'Critical',
    status: 'Draft' as 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Implemented',
    impact: '',
    justification: '',
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'Scope',
      priority: 'Medium',
      status: 'Draft',
      impact: '',
      justification: '',
    });
    setEditingRequest(null);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    if (editingRequest) {
      updateChangeRequest.mutate({ id: editingRequest.id, data: formData }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Change request updated" });
          setIsDialogOpen(false);
          resetForm();
        }
      });
    } else {
      createChangeRequest.mutate(formData, {
        onSuccess: () => {
          toast({ title: "Success", description: "Change request created" });
          setIsDialogOpen(false);
          resetForm();
        },
        onError: (err: any) => {
          if (err.limitExceeded) {
            setLimitError({ resourceType: err.resourceType || "change_requests", message: err.message });
            setIsDialogOpen(false);
          } else {
            toast({ title: "Error", description: err.message, variant: "destructive" });
          }
        }
      });
    }
  };

  const handleEdit = (request: ChangeRequest) => {
    setEditingRequest(request);
    setFormData({
      title: request.title,
      description: request.description || '',
      type: request.type as any,
      priority: request.priority as any,
      status: (request.status || 'Draft') as any,
      impact: request.impact || '',
      justification: request.justification || '',
    });
    setIsDialogOpen(true);
  };

  const handleStatusChange = (request: ChangeRequest, status: string) => {
    updateChangeRequest.mutate({ id: request.id, data: { status } }, {
      onSuccess: () => {
        toast({ title: "Status Updated", description: `Change request marked as ${status}` });
      }
    });
  };

  const getStatusBadge = (status: string | null) => {
    const styles: Record<string, string> = {
      Draft: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
      Submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      "Under Review": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
      Approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
      Rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
      Implemented: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    };
    return styles[status || 'Draft'] || styles.Draft;
  };

  const getPriorityBadge = (priority: string | null) => {
    const styles: Record<string, string> = {
      Low: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
      Medium: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
      High: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
      Critical: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    };
    return styles[priority || 'Medium'] || styles.Medium;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Change Requests
          </CardTitle>
          <CardDescription>Track and manage project change requests</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-change-request">
              <Plus className="h-4 w-4 mr-1" /> New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingRequest ? 'Edit Change Request' : 'New Change Request'}</DialogTitle>
              <DialogDescription>
                {editingRequest ? 'Update the change request details' : 'Submit a new change request for this project'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Brief title for the change request"
                  data-testid="input-change-request-title"
                />
              </div>
              <div className={editingRequest ? "grid grid-cols-3 gap-4" : "grid grid-cols-2 gap-4"}>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as any })}>
                    <SelectTrigger data-testid="select-change-request-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Scope">Scope</SelectItem>
                      <SelectItem value="Schedule">Schedule</SelectItem>
                      <SelectItem value="Budget">Budget</SelectItem>
                      <SelectItem value="Resource">Resource</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as any })}>
                    <SelectTrigger data-testid="select-change-request-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editingRequest && (
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as any })}>
                      <SelectTrigger data-testid="select-change-request-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Submitted">Submitted</SelectItem>
                        <SelectItem value="Under Review">Under Review</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                        <SelectItem value="Implemented">Implemented</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detailed description of the proposed change"
                  rows={3}
                  data-testid="input-change-request-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Impact Assessment</Label>
                <Textarea
                  value={formData.impact}
                  onChange={(e) => setFormData({ ...formData, impact: e.target.value })}
                  placeholder="Describe the impact of this change on the project"
                  rows={2}
                  data-testid="input-change-request-impact"
                />
              </div>
              <div className="space-y-2">
                <Label>Justification</Label>
                <Textarea
                  value={formData.justification}
                  onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                  placeholder="Why is this change necessary?"
                  rows={2}
                  data-testid="input-change-request-justification"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button 
                onClick={handleSubmit} 
                disabled={createChangeRequest.isPending || updateChangeRequest.isPending}
                data-testid="button-submit-change-request"
              >
                {(createChangeRequest.isPending || updateChangeRequest.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingRequest ? 'Update' : 'Submit'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!changeRequests || changeRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No change requests yet. Click "New Request" to submit one.
          </div>
        ) : (
          <div className="space-y-3">
            {changeRequests.map((request) => (
              <div 
                key={request.id}
                className="border rounded-lg p-4 space-y-3"
                data-testid={`change-request-${request.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium truncate">{request.title}</h4>
                      <Badge className={cn("text-xs", getStatusBadge(request.status))}>{request.status || 'Draft'}</Badge>
                      <Badge className={cn("text-xs", getPriorityBadge(request.priority))}>{request.priority || 'Medium'}</Badge>
                      <Badge variant="outline" className="text-xs">{request.type}</Badge>
                    </div>
                    {request.description && (
                      <p className="text-sm text-muted-foreground mt-1">{request.description}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-change-request-menu-${request.id}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(request)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(request, 'under_review')}>
                        <Clock className="h-4 w-4 mr-2" /> Mark Under Review
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(request, 'approved')}>
                        <Check className="h-4 w-4 mr-2" /> Approve
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(request, 'rejected')}>
                        <X className="h-4 w-4 mr-2" /> Reject
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(request, 'implemented')}>
                        <CheckSquare className="h-4 w-4 mr-2" /> Mark Implemented
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => deleteChangeRequest.mutate(request.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {(request.impact || request.justification) && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {request.impact && (
                      <div>
                        <span className="text-muted-foreground">Impact:</span>
                        <p className="text-slate-700 dark:text-slate-300">{request.impact}</p>
                      </div>
                    )}
                    {request.justification && (
                      <div>
                        <span className="text-muted-foreground">Justification:</span>
                        <p className="text-slate-700 dark:text-slate-300">{request.justification}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {request.createdAt && <span>Created: {format(new Date(request.createdAt), 'MMM d, yyyy')}</span>}
                  {request.reviewedDate && <span>Reviewed: {format(new Date(request.reviewedDate), 'MMM d, yyyy')}</span>}
                  {request.implementedDate && <span>Implemented: {format(new Date(request.implementedDate), 'MMM d, yyyy')}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <LimitExceededDialog
        open={!!limitError}
        onOpenChange={(o) => !o && setLimitError(null)}
        resourceType={limitError?.resourceType || "change_requests"}
        message={limitError?.message}
      />
    </Card>
  );
}

export function DocumentsTab({ projectId }: { projectId: number }) {
  const { data: documents, isLoading } = useProjectDocuments(projectId);
  const createDocument = useCreateProjectDocument(projectId);
  const updateDocument = useUpdateProjectDocument(projectId);
  const deleteDocument = useDeleteProjectDocument(projectId);
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<ProjectDocument | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; status: 'uploading' | 'done' | 'error' }[]>([]);
  const [previewDoc, setPreviewDoc] = useState<ProjectDocument | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'General' as string,
    fileUrl: '',
    version: '1.0',
    fileName: '',
  });

  const getFileUrl = (doc: ProjectDocument) => {
    if (!doc.fileUrl) return null;
    return doc.fileUrl.startsWith('/objects/') 
      ? doc.fileUrl 
      : doc.fileUrl.startsWith('http') 
        ? doc.fileUrl 
        : `/objects/${doc.fileUrl}`;
  };

  const canPreview = (doc: ProjectDocument) => {
    if (doc.content) return true;
    
    const mimeType = doc.mimeType?.toLowerCase() || '';
    const fileName = doc.fileName?.toLowerCase() || '';
    const ext = fileName.split('.').pop() || '';
    
    const previewableTypes = [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json',
      'video/mp4', 'video/webm',
      'audio/mpeg', 'audio/wav', 'audio/ogg'
    ];
    const previewableExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'txt', 'html', 'css', 'js', 'json', 'mp4', 'webm', 'mp3', 'wav', 'ogg'];
    
    return previewableTypes.includes(mimeType) || previewableExts.includes(ext);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category: 'General',
      fileUrl: '',
      version: '1.0',
      fileName: '',
    });
    setEditingDocument(null);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast({ title: "Error", description: "Document title is required", variant: "destructive" });
      return;
    }

    if (editingDocument) {
      updateDocument.mutate({ id: editingDocument.id, data: formData }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Document updated" });
          setIsDialogOpen(false);
          resetForm();
        }
      });
    } else {
      createDocument.mutate(formData, {
        onSuccess: () => {
          toast({ title: "Success", description: "Document added" });
          setIsDialogOpen(false);
          resetForm();
        }
      });
    }
  };

  const handleEdit = (doc: ProjectDocument) => {
    setEditingDocument(doc);
    setFormData({
      title: doc.title,
      description: doc.description || '',
      category: doc.category || 'General',
      fileUrl: doc.fileUrl || '',
      version: doc.version || '1.0',
      fileName: doc.fileName || '',
    });
    setIsDialogOpen(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const uploadFileToStorage = async (file: File): Promise<string> => {
    const urlResponse = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    });

    if (!urlResponse.ok) {
      throw new Error("Failed to get upload URL");
    }

    const { uploadURL, objectPath } = await urlResponse.json();

    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload file");
    }

    return objectPath;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      setUploadingFiles(prev => [...prev, { name: file.name, status: 'uploading' }]);
      
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
      let category = 'General';
      if (['pdf', 'doc', 'docx'].includes(fileExtension)) category = 'General';
      else if (['xls', 'xlsx', 'csv'].includes(fileExtension)) category = 'Report';
      else if (['ppt', 'pptx'].includes(fileExtension)) category = 'Design';
      else if (['txt', 'md'].includes(fileExtension)) category = 'Requirements';

      try {
        const objectPath = await uploadFileToStorage(file);
        
        await createDocument.mutateAsync({
          title: file.name.replace(/\.[^/.]+$/, ''),
          description: `Uploaded file: ${file.name}`,
          category,
          fileName: file.name,
          fileUrl: objectPath,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          version: '1.0',
        });
        
        setUploadingFiles(prev => 
          prev.map(f => f.name === file.name ? { ...f, status: 'done' } : f)
        );
        
        toast({ title: "Document Uploaded", description: `${file.name} has been uploaded` });
      } catch (error) {
        setUploadingFiles(prev => 
          prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
        );
        toast({ title: "Error", description: `Failed to upload ${file.name}`, variant: "destructive" });
      }
    }

    setTimeout(() => {
      setUploadingFiles([]);
    }, 3000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    setFormData({
      ...formData,
      title: formData.title || file.name.replace(/\.[^/.]+$/, ''),
      fileName: file.name,
    });
  };

  const getCategoryIcon = (category: string | null) => {
    switch (category?.toLowerCase()) {
      case 'contract': return <FileText className="h-4 w-4" />;
      case 'requirement':
      case 'requirements': return <ClipboardList className="h-4 w-4" />;
      case 'design': return <LayoutGrid className="h-4 w-4" />;
      case 'test': return <CheckSquare className="h-4 w-4" />;
      case 'report': return <FileText className="h-4 w-4" />;
      default: return <FolderOpen className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Project Documents
          </CardTitle>
          <CardDescription>Manage project documentation and files</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-document">
              <Plus className="h-4 w-4 mr-1" /> Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingDocument ? 'Edit Document' : 'Add Document'}</DialogTitle>
              <DialogDescription>
                {editingDocument ? 'Update the document details' : 'Add a new document reference to this project'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Project Charter, Requirements Spec"
                  data-testid="input-document-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger data-testid="select-document-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="General">General</SelectItem>
                      <SelectItem value="Charter">Charter</SelectItem>
                      <SelectItem value="Plan">Plan</SelectItem>
                      <SelectItem value="Requirements">Requirements</SelectItem>
                      <SelectItem value="Design">Design</SelectItem>
                      <SelectItem value="Test">Test</SelectItem>
                      <SelectItem value="Training">Training</SelectItem>
                      <SelectItem value="Report">Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Version</Label>
                  <Input
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    placeholder="e.g., 1.0, 2.1"
                    data-testid="input-document-version"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the document"
                  rows={2}
                  data-testid="input-document-description"
                />
              </div>
              <div className="space-y-2">
                <Label>File</Label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    onChange={handleFileSelect}
                    className="flex-1"
                    data-testid="input-document-file"
                  />
                </div>
                {formData.fileName && (
                  <p className="text-xs text-muted-foreground">Selected: {formData.fileName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>File URL / Link (optional)</Label>
                <Input
                  value={formData.fileUrl}
                  onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                  placeholder="https://... or external link"
                  data-testid="input-document-url"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button 
                onClick={handleSubmit} 
                disabled={createDocument.isPending || updateDocument.isPending}
                data-testid="button-submit-document"
              >
                {(createDocument.isPending || updateDocument.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingDocument ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
            isDragOver 
              ? "border-primary bg-primary/5" 
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="dropzone-documents"
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag and drop files here to add documents
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, Word, Excel, PowerPoint, and text files supported
          </p>
        </div>

        {uploadingFiles.length > 0 && (
          <div className="space-y-2">
            {uploadingFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                {file.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {file.status === 'done' && <Check className="h-4 w-4 text-green-600" />}
                {file.status === 'error' && <X className="h-4 w-4 text-red-600" />}
                <span className="text-sm truncate flex-1">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {file.status === 'uploading' ? 'Adding...' : file.status === 'done' ? 'Added' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}

        {!documents || documents.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            No documents yet. Drag files here or click "Add Document" to add one.
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div 
                key={doc.id}
                className="flex items-center justify-between gap-4 border rounded-lg p-3 hover-elevate"
                data-testid={`document-${doc.id}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-md bg-muted">
                    {getCategoryIcon(doc.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium truncate">{doc.title}</h4>
                      {doc.category && <Badge variant="outline" className="text-xs">{doc.category}</Badge>}
                      {doc.version && <span className="text-xs text-muted-foreground">v{doc.version}</span>}
                    </div>
                    {doc.description && (
                      <p className="text-sm text-muted-foreground truncate">{doc.description}</p>
                    )}
                    {doc.fileName && (
                      <span className="text-xs text-muted-foreground">File: {doc.fileName}</span>
                    )}
                    {doc.createdAt && (
                      <span className="text-xs text-muted-foreground block">
                        Added {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {(doc.fileUrl || doc.content) && canPreview(doc) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setPreviewDoc(doc)}
                          data-testid={`button-preview-document-${doc.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview document</TooltipContent>
                    </Tooltip>
                  )}
                  {doc.fileUrl && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            const url = getFileUrl(doc);
                            if (url) window.open(url, '_blank');
                          }}
                          data-testid={`button-open-document-${doc.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download document</TooltipContent>
                    </Tooltip>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => handleEdit(doc)}
                    data-testid={`button-edit-document-${doc.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => deleteDocument.mutate(doc.id)}
                    data-testid={`button-delete-document-${doc.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {previewDoc?.title || 'Document Preview'}
            </DialogTitle>
            <DialogDescription>
              {previewDoc?.fileName || 'Viewing document'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-[400px]">
            {previewDoc && (() => {
              const url = getFileUrl(previewDoc);
              
              if (previewDoc.content) {
                return (
                  <div className="p-4 bg-muted rounded-lg">
                    <pre className="whitespace-pre-wrap text-sm font-mono overflow-auto max-h-[600px]">
                      {previewDoc.content}
                    </pre>
                  </div>
                );
              }
              
              if (!url) return <div className="text-center py-8 text-muted-foreground">No file available</div>;
              
              const mimeType = previewDoc.mimeType?.toLowerCase() || '';
              const ext = (previewDoc.fileName?.split('.').pop() || '').toLowerCase();
              
              if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
                return <img src={url} alt={previewDoc.title} className="max-w-full h-auto mx-auto" />;
              }
              
              if (mimeType === 'application/pdf' || ext === 'pdf') {
                return <iframe src={url} className="w-full h-[600px] border-0" title={previewDoc.title} />;
              }
              
              if (mimeType.startsWith('video/') || ['mp4', 'webm'].includes(ext)) {
                return (
                  <video controls className="max-w-full mx-auto">
                    <source src={url} type={mimeType || 'video/mp4'} />
                    Your browser does not support the video tag.
                  </video>
                );
              }
              
              if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(ext)) {
                return (
                  <div className="py-8 flex justify-center">
                    <audio controls>
                      <source src={url} type={mimeType || 'audio/mpeg'} />
                      Your browser does not support the audio tag.
                    </audio>
                  </div>
                );
              }
              
              if (mimeType.startsWith('text/') || ['txt', 'html', 'css', 'js', 'json'].includes(ext)) {
                return <iframe src={url} className="w-full h-[600px] border rounded-md bg-muted" title={previewDoc.title} />;
              }
              
              return (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Preview not available for this file type.</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => window.open(url, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download to view
                  </Button>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>Close</Button>
            {previewDoc && getFileUrl(previewDoc) && (
              <Button onClick={() => window.open(getFileUrl(previewDoc)!, '_blank')}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export interface StatusReportTabProps {
  project: any;
  risks: Risk[];
  issues: Issue[];
  financials: ProjectFinancial[];
  tasks: Task[];
  changeRequests: ChangeRequest[];
  documents: ProjectDocument[];
}

export function StatusReportTab({
  project,
  risks,
  issues,
  financials,
  tasks,
  changeRequests,
  documents
}: StatusReportTabProps) {
  const { toast } = useToast();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { ProjectStatusReportPDF } = await import("@/components/ProjectStatusReportPDF");
      
      const doc = (
        <ProjectStatusReportPDF
          project={project}
          risks={risks}
          issues={issues}
          financials={financials}
          tasks={tasks}
          changeRequests={changeRequests}
          documents={documents}
          executiveSummary={project.description || ""}
        />
      );
      
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.name.replace(/[^a-z0-9]/gi, "_")}_Status_Report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download Started",
        description: "Your PDF report is being downloaded."
      });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Download Failed",
        description: "Could not generate the PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSendEmail = async () => {
    if (!recipientEmail) {
      toast({
        title: "Email Required",
        description: "Please enter a recipient email address.",
        variant: "destructive"
      });
      return;
    }
    
    setIsSendingEmail(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { ProjectStatusReportPDF } = await import("@/components/ProjectStatusReportPDF");
      
      const doc = (
        <ProjectStatusReportPDF
          project={project}
          risks={risks}
          issues={issues}

          financials={financials}
          tasks={tasks}
          changeRequests={changeRequests}
          documents={documents}
          executiveSummary={project.description || ""}
        />
      );
      
      const blob = await pdf(doc).toBlob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      const pdfFileName = `${project.name.replace(/[^a-z0-9]/gi, "_")}_Status_Report.pdf`;
      
      await apiRequest("POST", `/api/projects/${project.id}/status-report/email`, {
        recipientEmail,
        executiveSummary: project.description || "",
        pdfBase64: base64,
        pdfFileName
      });
      
      toast({
        title: "Report Sent",
        description: `Status report sent to ${recipientEmail}`
      });
      setShowEmailDialog(false);
      setRecipientEmail("");
    } catch (error: any) {
      toast({
        title: "Failed to Send",
        description: error?.message || "Could not send the status report. Please check email settings.",
        variant: "destructive"
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Comprehensive Project Status Report
            </CardTitle>
            <CardDescription>
              Complete overview of project status, progress, risks, issues, and financials
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              data-testid="button-download-status-report"
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
            <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-share-status-report">
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share Status Report</DialogTitle>
                  <DialogDescription>
                    Send this status report as a PDF attachment via email.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipient-email">Recipient Email</Label>
                    <Input
                      id="recipient-email"
                      type="email"
                      placeholder="Enter email address"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      data-testid="input-recipient-email"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSendEmail} 
                    disabled={isSendingEmail}
                    data-testid="button-send-status-report"
                  >
                    {isSendingEmail ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Send Email
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ProjectStatusReport
          project={project}
          risks={risks}
          issues={issues}

          financials={financials}
          tasks={tasks}
          changeRequests={changeRequests}
          documents={documents}
          executiveSummary={project.description || ""}
        />
      </CardContent>
    </Card>
  );
}

export function ScoringTab({ projectId, organizationId }: { projectId: number; organizationId: number }) {
  const { data: criteria, isLoading: loadingCriteria } = useScoringCriteria(organizationId);
  const { data: scores, isLoading: loadingScores } = useProjectScores(projectId);
  const createCriteria = useCreateScoringCriteria();
  const updateCriteria = useUpdateScoringCriteria();
  const deleteCriteria = useDeleteScoringCriteria();
  const saveScore = useSaveProjectScore();
  const { toast } = useToast();
  
  const [showAddCriteria, setShowAddCriteria] = useState(false);
  const [newCriteria, setNewCriteria] = useState({ name: '', description: '', category: 'Strategic', weight: '1', minScore: 0, maxScore: 10 });
  const [localScores, setLocalScores] = useState<Record<number, { score: number; justification: string }>>({});
  const [editingWeightId, setEditingWeightId] = useState<number | null>(null);
  const [editingWeightValue, setEditingWeightValue] = useState('');

  useEffect(() => {
    if (scores) {
      const scoreMap: Record<number, { score: number; justification: string }> = {};
      scores.forEach(s => {
        scoreMap[s.criteriaId] = { score: s.score, justification: s.justification || '' };
      });
      setLocalScores(scoreMap);
    }
  }, [scores]);

  const handleAddCriteria = async () => {
    try {
      await createCriteria.mutateAsync({ organizationId, data: newCriteria });
      toast({ title: "Criteria added" });
      setShowAddCriteria(false);
      setNewCriteria({ name: '', description: '', category: 'Strategic', weight: '1', minScore: 0, maxScore: 10 });
    } catch {
      toast({ title: "Error", description: "Failed to add criteria", variant: "destructive" });
    }
  };

  const handleScoreChange = (criteriaId: number, score: number) => {
    setLocalScores(prev => ({ ...prev, [criteriaId]: { ...prev[criteriaId], score, justification: prev[criteriaId]?.justification || '' } }));
  };

  const handleJustificationChange = (criteriaId: number, justification: string) => {
    setLocalScores(prev => ({ ...prev, [criteriaId]: { ...prev[criteriaId], justification, score: prev[criteriaId]?.score || 0 } }));
  };

  const handleSaveScore = async (criteriaId: number) => {
    const local = localScores[criteriaId];
    if (!local) return;
    try {
      await saveScore.mutateAsync({ projectId, criteriaId, score: local.score, justification: local.justification });
      toast({ title: "Score saved" });
    } catch {
      toast({ title: "Error", description: "Failed to save score", variant: "destructive" });
    }
  };

  const handleDeleteCriteria = async (id: number) => {
    try {
      await deleteCriteria.mutateAsync({ id, organizationId });
      toast({ title: "Criteria deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete criteria", variant: "destructive" });
    }
  };

  const startEditWeight = (c: { id: number; weight: string | null }) => {
    setEditingWeightId(c.id);
    setEditingWeightValue(String(c.weight || '1'));
  };

  const handleSaveWeight = async (criteriaId: number) => {
    const parsed = parseFloat(editingWeightValue);
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Invalid weight", description: "Weight must be a positive number", variant: "destructive" });
      return;
    }
    try {
      await updateCriteria.mutateAsync({ id: criteriaId, organizationId, data: { weight: editingWeightValue } });
      toast({ title: "Weight updated" });
      setEditingWeightId(null);
    } catch {
      toast({ title: "Error", description: "Failed to update weight", variant: "destructive" });
    }
  };

  if (loadingCriteria || loadingScores) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const activeCriteria = criteria?.filter(c => c.isActive) || [];
  
  const calculateTotalScore = () => {
    let totalWeightedScore = 0;
    let totalWeight = 0;
    activeCriteria.forEach(c => {
      const score = localScores[c.id]?.score;
      if (score !== undefined) {
        const weight = parseFloat(String(c.weight)) || 1;
        totalWeightedScore += score * weight;
        totalWeight += weight;
      }
    });
    return totalWeight > 0 ? (totalWeightedScore / totalWeight).toFixed(2) : 'N/A';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Project Scoring</CardTitle>
        <Button size="sm" onClick={() => setShowAddCriteria(true)} data-testid="button-add-criteria">
          <Plus className="h-4 w-4 mr-1" /> Add Criteria
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-4 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground">Weighted Total Score</div>
          <div className="text-3xl font-bold">{calculateTotalScore()}</div>
        </div>

        {showAddCriteria && (
          <Card className="mb-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input value={newCriteria.name} onChange={e => setNewCriteria(p => ({ ...p, name: e.target.value }))} data-testid="input-criteria-name" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={newCriteria.category} onValueChange={v => setNewCriteria(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Strategic">Strategic</SelectItem>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Risk">Risk</SelectItem>
                    <SelectItem value="Resource">Resource</SelectItem>
                    <SelectItem value="Technical">Technical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea value={newCriteria.description} onChange={e => setNewCriteria(p => ({ ...p, description: e.target.value }))} data-testid="input-criteria-description" />
              </div>
              <div>
                <Label>Weight</Label>
                <Input type="number" value={newCriteria.weight} onChange={e => setNewCriteria(p => ({ ...p, weight: e.target.value }))} data-testid="input-criteria-weight" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAddCriteria(false)}>Cancel</Button>
              <Button onClick={handleAddCriteria} disabled={!newCriteria.name} data-testid="button-save-criteria">Save</Button>
            </div>
          </Card>
        )}

        <div className="space-y-4">
          {activeCriteria.map(c => (
            <Card key={c.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-muted-foreground">{c.description}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary">{c.category}</Badge>
                    {editingWeightId === c.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Weight:</span>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={editingWeightValue}
                          onChange={e => setEditingWeightValue(e.target.value)}
                          className="h-6 w-16 text-xs px-1"
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveWeight(c.id);
                            if (e.key === 'Escape') setEditingWeightId(null);
                          }}
                          autoFocus
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSaveWeight(c.id)}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingWeightId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => startEditWeight(c)}
                      >
                        Weight: {c.weight || '1'}
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDeleteCriteria(c.id)} data-testid={`button-delete-criteria-${c.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4">
                <div className="flex items-center gap-4">
                  <Label className="w-16">Score:</Label>
                  <Slider 
                    value={[localScores[c.id]?.score || 0]} 
                    onValueChange={([v]) => handleScoreChange(c.id, v)}
                    min={c.minScore || 0}
                    max={c.maxScore || 10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-center font-bold">{localScores[c.id]?.score || 0}/{c.maxScore || 10}</span>
                </div>
                <div className="mt-2">
                  <Label>Justification</Label>
                  <Textarea 
                    value={localScores[c.id]?.justification || ''} 
                    onChange={e => handleJustificationChange(c.id, e.target.value)}
                    placeholder="Explain the score..."
                    data-testid={`input-justification-${c.id}`}
                  />
                </div>
                <Button size="sm" className="mt-2" onClick={() => handleSaveScore(c.id)} data-testid={`button-save-score-${c.id}`}>
                  Save Score
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {activeCriteria.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No scoring criteria defined. Click "Add Criteria" to create one.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BenefitsTab({ projectId }: { projectId: number }) {
  const { data: benefits, isLoading } = useProjectBenefits(projectId);
  const createBenefit = useCreateProjectBenefit();
  const updateBenefit = useUpdateProjectBenefit();
  const deleteBenefit = useDeleteProjectBenefit();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', description: '', category: 'Financial', benefitType: 'Tangible', unit: 'Currency', targetValue: '', actualValue: '', targetDate: '', status: 'Planned' });

  const handleAdd = async () => {
    try {
      await createBenefit.mutateAsync({ 
        projectId, 
        data: { 
          name: form.name, 
          description: form.description, 
          category: form.category, 
          benefitType: form.benefitType, 
          unit: form.unit, 
          targetValue: form.targetValue || null, 
          actualValue: form.actualValue || null, 
          targetDate: form.targetDate || null, 
          status: form.status 
        } 
      });
      toast({ title: "Benefit added" });
      setShowAdd(false);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to add benefit", variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      await updateBenefit.mutateAsync({
        id: editingId,
        projectId,
        data: {
          name: form.name,
          description: form.description,
          category: form.category,
          benefitType: form.benefitType,
          unit: form.unit,
          targetValue: form.targetValue || null,
          actualValue: form.actualValue || null,
          targetDate: form.targetDate || null,
          status: form.status,
        }
      });
      toast({ title: "Benefit updated" });
      setEditingId(null);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to update benefit", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteBenefit.mutateAsync({ id, projectId });
      toast({ title: "Benefit deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete benefit", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', category: 'Financial', benefitType: 'Tangible', unit: 'Currency', targetValue: '', actualValue: '', targetDate: '', status: 'Planned' });
  };

  const startEdit = (b: any) => {
    setEditingId(b.id);
    setForm({
      name: b.name,
      description: b.description || '',
      category: b.category || 'Financial',
      benefitType: b.benefitType || 'Tangible',
      unit: b.unit || 'Currency',
      targetValue: b.targetValue?.toString() || '',
      actualValue: b.actualValue?.toString() || '',
      targetDate: b.targetDate || '',
      status: b.status || 'Planned'
    });
  };

  const calculateRealization = (target: any, actual: any) => {
    const t = parseFloat(target);
    const a = parseFloat(actual);
    if (!t || t === 0) return null;
    return Math.round((a / t) * 100);
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Benefits Tracking</CardTitle>
        <Button size="sm" onClick={() => { setShowAdd(true); setEditingId(null); resetForm(); }} data-testid="button-add-benefit">
          <Plus className="h-4 w-4 mr-1" /> Add Benefit
        </Button>
      </CardHeader>
      <CardContent>
        {(showAdd || editingId) && (
          <Card className="mb-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} data-testid="input-benefit-name" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Operational">Operational</SelectItem>
                    <SelectItem value="Strategic">Strategic</SelectItem>
                    <SelectItem value="Customer">Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.benefitType} onValueChange={v => setForm(p => ({ ...p, benefitType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tangible">Tangible</SelectItem>
                    <SelectItem value="Intangible">Intangible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Currency">Currency</SelectItem>
                    <SelectItem value="Percentage">Percentage</SelectItem>
                    <SelectItem value="Hours">Hours</SelectItem>
                    <SelectItem value="Number">Number</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Value</Label>
                <Input type="number" value={form.targetValue} onChange={e => setForm(p => ({ ...p, targetValue: e.target.value }))} />
              </div>
              <div>
                <Label>Actual Value</Label>
                <Input type="number" value={form.actualValue} onChange={e => setForm(p => ({ ...p, actualValue: e.target.value }))} />
              </div>
              <div>
                <Label>Target Date</Label>
                <Input type="date" value={form.targetDate} onChange={e => setForm(p => ({ ...p, targetDate: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planned">Planned</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Partially Realized">Partially Realized</SelectItem>
                    <SelectItem value="Fully Realized">Fully Realized</SelectItem>
                    <SelectItem value="Not Achieved">Not Achieved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }}>Cancel</Button>
              <Button onClick={editingId ? handleUpdate : handleAdd} disabled={!form.name} data-testid="button-save-benefit">
                {editingId ? 'Update' : 'Save'}
              </Button>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {benefits?.map(b => {
            const realization = calculateRealization(b.targetValue, b.actualValue);
            return (
              <Card key={b.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-sm text-muted-foreground">{b.description}</div>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary">{b.category}</Badge>
                      <Badge variant="outline">{b.benefitType}</Badge>
                      <Badge>{b.status}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(b)} data-testid={`button-edit-benefit-${b.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)} data-testid={`button-delete-benefit-${b.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Target</div>
                    <div className="font-medium">{b.targetValue ? `${b.targetValue} ${b.unit}` : '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Actual</div>
                    <div className="font-medium">{b.actualValue ? `${b.actualValue} ${b.unit}` : '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Realization</div>
                    <div className="font-medium">{realization !== null ? `${realization}%` : '-'}</div>
                  </div>
                </div>
                {realization !== null && (
                  <Progress value={Math.min(realization, 100)} className="mt-2" />
                )}
              </Card>
            );
          })}
        </div>

        {(!benefits || benefits.length === 0) && !showAdd && (
          <div className="text-center py-8 text-muted-foreground">
            No benefits tracked yet. Click "Add Benefit" to start tracking.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DecisionsTab({ projectId }: { projectId: number }) {
  const { data: decisions, isLoading } = useProjectDecisions(projectId);
  const createDecision = useCreateProjectDecision();
  const updateDecision = useUpdateProjectDecision();
  const deleteDecision = useDeleteProjectDecision();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', description: '', decisionType: 'Strategic', status: 'Pending', rationale: '', impact: '', priority: 'Medium', decisionDate: '' });

  const handleAdd = async () => {
    try {
      await createDecision.mutateAsync({
        projectId,
        data: {
          title: form.title,
          description: form.description,
          decisionType: form.decisionType,
          status: form.status,
          rationale: form.rationale,
          impact: form.impact,
          priority: form.priority,
          decisionDate: form.decisionDate || null,
        }
      });
      toast({ title: "Decision logged" });
      setShowAdd(false);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to log decision", variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      await updateDecision.mutateAsync({
        id: editingId,
        projectId,
        data: {
          title: form.title,
          description: form.description,
          decisionType: form.decisionType,
          status: form.status,
          rationale: form.rationale,
          impact: form.impact,
          priority: form.priority,
          decisionDate: form.decisionDate || null,
        }
      });
      toast({ title: "Decision updated" });
      setEditingId(null);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to update decision", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDecision.mutateAsync({ id, projectId });
      toast({ title: "Decision deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete decision", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setForm({ title: '', description: '', decisionType: 'Strategic', status: 'Pending', rationale: '', impact: '', priority: 'Medium', decisionDate: '' });
  };

  const startEdit = (d: any) => {
    setEditingId(d.id);
    setForm({
      title: d.title,
      description: d.description || '',
      decisionType: d.decisionType || 'Strategic',
      status: d.status || 'Pending',
      rationale: d.rationale || '',
      impact: d.impact || '',
      priority: d.priority || 'Medium',
      decisionDate: d.decisionDate || ''
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      case 'Implemented': return 'bg-blue-100 text-blue-800';
      case 'Deferred': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Decision Log</CardTitle>
        <Button size="sm" onClick={() => { setShowAdd(true); setEditingId(null); resetForm(); }} data-testid="button-add-decision">
          <Plus className="h-4 w-4 mr-1" /> Log Decision
        </Button>
      </CardHeader>
      <CardContent>
        {(showAdd || editingId) && (
          <Card className="mb-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} data-testid="input-decision-title" />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.decisionType} onValueChange={v => setForm(p => ({ ...p, decisionType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Strategic">Strategic</SelectItem>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Resource">Resource</SelectItem>
                    <SelectItem value="Risk">Risk</SelectItem>
                    <SelectItem value="Scope">Scope</SelectItem>
                    <SelectItem value="Technical">Technical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                    <SelectItem value="Deferred">Deferred</SelectItem>
                    <SelectItem value="Implemented">Implemented</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Rationale</Label>
                <Textarea value={form.rationale} onChange={e => setForm(p => ({ ...p, rationale: e.target.value }))} placeholder="Why was this decision made?" />
              </div>
              <div className="col-span-2">
                <Label>Expected Impact</Label>
                <Textarea value={form.impact} onChange={e => setForm(p => ({ ...p, impact: e.target.value }))} placeholder="What is the expected impact?" />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Decision Date</Label>
                <Input type="date" value={form.decisionDate} onChange={e => setForm(p => ({ ...p, decisionDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }}>Cancel</Button>
              <Button onClick={editingId ? handleUpdate : handleAdd} disabled={!form.title} data-testid="button-save-decision">
                {editingId ? 'Update' : 'Save'}
              </Button>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {decisions?.map(d => (
            <Card key={d.id} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{d.title}</div>
                  <div className="text-sm text-muted-foreground">{d.description}</div>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="secondary">{d.decisionType}</Badge>
                    <Badge className={getStatusColor(d.status || '')}>{d.status}</Badge>
                    <Badge variant="outline">{d.priority}</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(d)} data-testid={`button-edit-decision-${d.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)} data-testid={`button-delete-decision-${d.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {(d.rationale || d.impact) && (
                <div className="mt-3 text-sm space-y-2">
                  {d.rationale && (
                    <div>
                      <span className="font-medium">Rationale:</span> {d.rationale}
                    </div>
                  )}
                  {d.impact && (
                    <div>
                      <span className="font-medium">Impact:</span> {d.impact}
                    </div>
                  )}
                </div>
              )}
              {d.decisionDate && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Decision Date: {format(new Date(d.decisionDate), 'MMM d, yyyy')}
                </div>
              )}
            </Card>
          ))}
        </div>

        {(!decisions || decisions.length === 0) && !showAdd && (
          <div className="text-center py-8 text-muted-foreground">
            No decisions logged yet. Click "Log Decision" to record a decision.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LessonsLearnedTab({ projectId, organizationId }: { projectId: number; organizationId: number }) {
  const { data: lessons, isLoading } = useLessonsLearned(projectId);
  const createLesson = useCreateLessonLearned();
  const updateLesson = useUpdateLessonLearned();
  const deleteLesson = useDeleteLessonLearned();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Process',
    lessonType: 'Positive',
    impact: 'Medium',
    phase: '',
    rootCause: '',
    recommendations: '',
    status: 'Draft'
  });

  const handleAdd = async () => {
    try {
      await createLesson.mutateAsync({
        projectId,
        organizationId,
        data: {
          title: form.title,
          description: form.description,
          category: form.category,
          lessonType: form.lessonType,
          impact: form.impact,
          phase: form.phase || null,
          rootCause: form.rootCause || null,
          recommendation: form.recommendations || null,
          status: form.status,
          organizationId
        }
      });
      toast({ title: "Lesson learned added" });
      setShowAdd(false);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to add lesson learned", variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      await updateLesson.mutateAsync({
        id: editingId,
        projectId,
        organizationId,
        data: {
          title: form.title,
          description: form.description,
          category: form.category,
          lessonType: form.lessonType,
          impact: form.impact,
          phase: form.phase || null,
          rootCause: form.rootCause || null,
          recommendation: form.recommendations || null,
          status: form.status
        }
      });
      toast({ title: "Lesson learned updated" });
      setEditingId(null);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to update lesson learned", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteLesson.mutateAsync({ id, projectId, organizationId });
      toast({ title: "Lesson learned deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete lesson learned", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      category: 'Process',
      lessonType: 'Positive',
      impact: 'Medium',
      phase: '',
      rootCause: '',
      recommendations: '',
      status: 'Draft'
    });
  };

  const startEdit = (l: any) => {
    setEditingId(l.id);
    setForm({
      title: l.title,
      description: l.description || '',
      category: l.category || 'Process',
      lessonType: l.lessonType || 'Positive',
      impact: l.impact || 'Medium',
      phase: l.phase || '',
      rootCause: l.rootCause || '',
      recommendations: l.recommendation || '',
      status: l.status || 'Draft'
    });
  };

  const getTypeColor = (type: string) => {
    return type === 'Positive' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Under Review': return 'bg-yellow-100 text-yellow-800';
      case 'Archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'High': return 'bg-red-100 text-red-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Lessons Learned</CardTitle>
        <Button size="sm" onClick={() => { setShowAdd(true); setEditingId(null); resetForm(); }} data-testid="button-add-lesson">
          <Plus className="h-4 w-4 mr-1" /> Add Lesson
        </Button>
      </CardHeader>
      <CardContent>
        {(showAdd || editingId) && (
          <Card className="mb-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} data-testid="input-lesson-title" />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the lesson learned..." />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Process">Process</SelectItem>
                    <SelectItem value="Technical">Technical</SelectItem>
                    <SelectItem value="Communication">Communication</SelectItem>
                    <SelectItem value="Resource">Resource</SelectItem>
                    <SelectItem value="Risk Management">Risk Management</SelectItem>
                    <SelectItem value="Stakeholder">Stakeholder</SelectItem>
                    <SelectItem value="Vendor">Vendor</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.lessonType} onValueChange={v => setForm(p => ({ ...p, lessonType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Positive">Positive (What Went Well)</SelectItem>
                    <SelectItem value="Negative">Negative (What to Improve)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Impact</Label>
                <Select value={form.impact} onValueChange={v => setForm(p => ({ ...p, impact: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Phase</Label>
                <Select value={form.phase || ''} onValueChange={v => setForm(p => ({ ...p, phase: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select phase..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Initiation">Initiation</SelectItem>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="Execution">Execution</SelectItem>
                    <SelectItem value="Monitoring">Monitoring & Control</SelectItem>
                    <SelectItem value="Closure">Closure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Root Cause</Label>
                <Textarea value={form.rootCause} onChange={e => setForm(p => ({ ...p, rootCause: e.target.value }))} placeholder="What was the underlying cause?" />
              </div>
              <div className="col-span-2">
                <Label>Recommendations</Label>
                <Textarea value={form.recommendations} onChange={e => setForm(p => ({ ...p, recommendations: e.target.value }))} placeholder="What should be done differently in the future?" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Under Review">Under Review</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }}>Cancel</Button>
              <Button onClick={editingId ? handleUpdate : handleAdd} disabled={!form.title} data-testid="button-save-lesson">
                {editingId ? 'Update' : 'Save'}
              </Button>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {lessons?.map(l => (
            <Card key={l.id} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{l.title}</div>
                  <div className="text-sm text-muted-foreground">{l.description}</div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge variant="secondary">{l.category}</Badge>
                    <Badge className={getTypeColor(l.lessonType || '')}>{l.lessonType}</Badge>
                    <Badge className={getImpactColor(l.impact || '')}>{l.impact} Impact</Badge>
                    <Badge className={getStatusColor(l.status || '')}>{l.status}</Badge>
                    {l.phase && <Badge variant="outline">{l.phase}</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(l)} data-testid={`button-edit-lesson-${l.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(l.id)} data-testid={`button-delete-lesson-${l.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {(l.rootCause || l.recommendation) && (
                <div className="mt-3 text-sm space-y-2">
                  {l.rootCause && (
                    <div>
                      <span className="font-medium">Root Cause:</span> {l.rootCause}
                    </div>
                  )}
                  {l.recommendation && (
                    <div>
                      <span className="font-medium">Recommendations:</span> {l.recommendation}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                Added: {format(new Date(l.createdAt!), 'MMM d, yyyy')}
              </div>
            </Card>
          ))}
        </div>

        {(!lessons || lessons.length === 0) && !showAdd && (
          <div className="text-center py-8 text-muted-foreground">
            No lessons learned yet. Click "Add Lesson" to document a lesson.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface Dynamics365Invoice {
  id: string;
  invoiceNumber: string;
  name: string;
  description: string;
  amount: number;
  tax: number;
  status: string;
  createdOn: string;
  dueDate: string | null;
  customerName: string;
  customerAddress: string;
}

export function InvoicesTab({ projectId, organizationId, contractTotal }: { projectId: number; organizationId: number | undefined; contractTotal?: string | null }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<ProjectInvoice | null>(null);
  const [notesInvoice, setNotesInvoice] = useState<ProjectInvoice | null>(null);
  const [newNote, setNewNote] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{ name: string; url: string; size: number; type: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<ProjectInvoice | null>(null);
  const [isDynamicsImportOpen, setIsDynamicsImportOpen] = useState(false);
  const [dynamicsSearch, setDynamicsSearch] = useState('');
  const [selectedDynamicsInvoice, setSelectedDynamicsInvoice] = useState<Dynamics365Invoice | null>(null);
  const [dynamics365EnvUrl, setDynamics365EnvUrl] = useState('');
  const [isEditingContractTotal, setIsEditingContractTotal] = useState(false);
  const [contractTotalInput, setContractTotalInput] = useState(contractTotal || '0');
  const [isSavingContractTotal, setIsSavingContractTotal] = useState(false);
  const { mutateAsync: updateProject } = useUpdateProject();

  useEffect(() => {
    setContractTotalInput(contractTotal || '0');
  }, [contractTotal]);

  const { data: invoices = [], isLoading, refetch: refetchInvoices } = useQuery<ProjectInvoice[]>({
    queryKey: ['/api/projects', projectId, 'invoices'],
  });

  const { data: dynamics365Status, refetch: refetchDynamics365Status } = useQuery<{ configured: boolean; connected: boolean; environmentUrl: string | null; needsRefresh?: boolean }>({
    queryKey: ['/api/dynamics365/status', organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/dynamics365/status?organizationId=${organizationId}`);
      return res.json();
    },
    enabled: !!organizationId,
  });

  const { data: dynamics365Invoices, isLoading: isDynamicsLoading, refetch: refetchDynamicsInvoices } = useQuery<{ invoices: Dynamics365Invoice[] }>({
    queryKey: ['/api/dynamics365/invoices', organizationId, dynamicsSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId: String(organizationId) });
      if (dynamicsSearch) params.append('search', dynamicsSearch);
      const res = await fetch(`/api/dynamics365/invoices?${params.toString()}`);
      return res.json();
    },
    enabled: isDynamicsImportOpen && !!organizationId && (dynamics365Status?.connected || dynamics365Status?.needsRefresh),
    retry: false,
  });

  const { data: invoiceNotes = [], refetch: refetchNotes } = useQuery<InvoiceNote[]>({
    queryKey: ['/api/invoices', notesInvoice?.id, 'notes'],
    enabled: !!notesInvoice,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<ProjectInvoice>) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/invoices`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Invoice created" });
      refetchInvoices();
      setIsDialogOpen(false);
      setEditingInvoice(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create invoice", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ProjectInvoice> }) => {
      const res = await apiRequest('PATCH', `/api/invoices/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Invoice updated" });
      refetchInvoices();
      setIsDialogOpen(false);
      setEditingInvoice(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update invoice", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/invoices/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Invoice deleted" });
      refetchInvoices();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete invoice", variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ invoiceId, note }: { invoiceId: number; note: string }) => {
      const res = await apiRequest('POST', `/api/invoices/${invoiceId}/notes`, { note });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Note added" });
      refetchNotes();
      setNewNote('');
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add note", variant: "destructive" });
    },
  });

  const resyncMutation = useMutation({
    mutationFn: async (invoice: ProjectInvoice) => {
      const externalId = (invoice as any).externalId;
      if (!externalId || !dynamics365Status?.environmentUrl || !organizationId) {
        throw new Error('Cannot resync: missing external ID, environment URL, or organization');
      }
      const res = await apiRequest('GET', `/api/dynamics365/invoices/${externalId}?organizationId=${organizationId}`);
      if (!res.ok) throw new Error('Failed to fetch invoice from Dynamics 365');
      const { invoice: dynamicsInvoice } = await res.json();
      
      const updateRes = await apiRequest('PATCH', `/api/invoices/${invoice.id}`, {
        invoiceNumber: dynamicsInvoice.invoiceNumber,
        title: dynamicsInvoice.name,
        description: dynamicsInvoice.description || '',
        amount: String(dynamicsInvoice.amount || 0),
        status: dynamicsInvoice.status === 'Paid' ? 'Paid' : 
                dynamicsInvoice.status === 'Cancelled' ? 'Cancelled' : 'Draft',
        dueDate: dynamicsInvoice.dueDate,
        vendorName: dynamicsInvoice.customerName,
      });
      return updateRes.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Invoice resynced from Dynamics 365" });
      refetchInvoices();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resync invoice", variant: "destructive" });
    },
  });

  const statusColors: Record<string, string> = {
    Draft: 'bg-muted text-muted-foreground',
    Sent: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    Paid: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    Overdue: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    Cancelled: 'bg-gray-100 dark:bg-gray-900/30 text-gray-500',
  };

  const uploadFileToStorage = async (file: File): Promise<{ url: string; name: string; size: number; type: string }> => {
    const urlResponse = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    });

    if (!urlResponse.ok) {
      throw new Error("Failed to get upload URL");
    }

    const { uploadURL, objectPath } = await urlResponse.json();

    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload file");
    }

    return { url: objectPath, name: file.name, size: file.size, type: file.type || "application/octet-stream" };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadFileToStorage(file);
      setUploadedFile(result);
      toast({ title: "Success", description: "File uploaded" });
    } catch {
      toast({ title: "Error", description: "Failed to upload file", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (formData: FormData) => {
    const data: Partial<ProjectInvoice> = {
      invoiceNumber: formData.get('invoiceNumber') as string,
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      amount: formData.get('amount') as string || '0',
      currency: formData.get('currency') as string || 'USD',
      status: formData.get('status') as string || 'Draft',
      invoiceDate: formData.get('invoiceDate') as string || null,
      dueDate: formData.get('dueDate') as string || null,
      vendorName: formData.get('vendorName') as string,
      vendorEmail: formData.get('vendorEmail') as string,
    };

    if (uploadedFile) {
      data.fileName = uploadedFile.name;
      data.fileUrl = uploadedFile.url;
      data.fileSize = uploadedFile.size;
      data.mimeType = uploadedFile.type;
    } else {
      data.fileName = null;
      data.fileUrl = null;
      data.fileSize = null;
      data.mimeType = null;
    }

    if (!data.title?.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    if (editingInvoice) {
      updateMutation.mutate({ id: editingInvoice.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (invoice: ProjectInvoice) => {
    setEditingInvoice(invoice);
    if (invoice.fileUrl && invoice.fileName) {
      setUploadedFile({ name: invoice.fileName, url: invoice.fileUrl, size: invoice.fileSize || 0, type: invoice.mimeType || '' });
    } else {
      setUploadedFile(null);
    }
    setIsDialogOpen(true);
  };

  const getFileUrl = (invoice: ProjectInvoice) => {
    if (!invoice.fileUrl) return null;
    return invoice.fileUrl.startsWith('/objects/') 
      ? invoice.fileUrl 
      : invoice.fileUrl.startsWith('http') 
        ? invoice.fileUrl 
        : `/objects/${invoice.fileUrl}`;
  };

  const formatCurrency = (amount: string | null, currency: string | null) => {
    if (!amount) return '-';
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(num);
  };

  const invoiceFinancials = useMemo(() => {
    const total = parseFloat(contractTotal || '0');
    const invoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);
    const paid = invoices.filter(inv => inv.status === 'Paid').reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);
    const remaining = total - invoiced;
    return { total, invoiced, paid, remaining };
  }, [contractTotal, invoices]);

  const handleContractTotalSave = async () => {
    setIsSavingContractTotal(true);
    try {
      await updateProject({ id: projectId, contractTotal: contractTotalInput });
      toast({ title: "Success", description: "Contract total updated" });
      setIsEditingContractTotal(false);
    } catch {
      toast({ title: "Error", description: "Failed to update contract total", variant: "destructive" });
    } finally {
      setIsSavingContractTotal(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <CardTitle>Invoices</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {dynamics365Status?.configured && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsDynamicsImportOpen(true)} 
              data-testid="button-import-dynamics"
            >
              <Download className="h-4 w-4 mr-2" /> Import from Dynamics
            </Button>
          )}
          <Button size="sm" onClick={() => { setEditingInvoice(null); setUploadedFile(null); setIsDialogOpen(true); }} data-testid="button-add-invoice">
            <Plus className="h-4 w-4 mr-2" /> Add Invoice
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 bg-muted/50 rounded-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Contract Total</div>
              {isEditingContractTotal ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={contractTotalInput}
                    onChange={(e) => setContractTotalInput(e.target.value)}
                    className="w-28"
                    data-testid="input-contract-total"
                  />
                  <Button size="sm" variant="ghost" onClick={handleContractTotalSave} disabled={isSavingContractTotal} data-testid="button-save-contract-total">
                    {isSavingContractTotal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setIsEditingContractTotal(false); setContractTotalInput(contractTotal || '0'); }} disabled={isSavingContractTotal} data-testid="button-cancel-contract-total">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-lg font-semibold">{formatCurrency(String(invoiceFinancials.total), null)}</span>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditingContractTotal(true)} data-testid="button-edit-contract-total">
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Invoiced</div>
              <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(String(invoiceFinancials.invoiced), null)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Paid</div>
              <div className="text-lg font-semibold text-green-600 dark:text-green-400">{formatCurrency(String(invoiceFinancials.paid), null)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Remaining Balance</div>
              <div className={cn("text-lg font-semibold", invoiceFinancials.remaining < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                {formatCurrency(String(invoiceFinancials.remaining), null)}
              </div>
            </div>
          </div>
          {invoiceFinancials.total > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Invoice Progress</span>
                <span>{Math.min(100, Math.round((invoiceFinancials.invoiced / invoiceFinancials.total) * 100))}%</span>
              </div>
              <Progress value={Math.min(100, (invoiceFinancials.invoiced / invoiceFinancials.total) * 100)} className="h-2" />
            </div>
          )}
        </div>
        
        {invoices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No invoices yet. Click "Add Invoice" to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium w-8">Source</th>
                  <th className="text-left py-2 px-2 font-medium">Invoice #</th>
                  <th className="text-left py-2 px-2 font-medium">Title</th>
                  <th className="text-left py-2 px-2 font-medium">Vendor</th>
                  <th className="text-right py-2 px-2 font-medium">Amount</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                  <th className="text-left py-2 px-2 font-medium">Due Date</th>
                  <th className="text-left py-2 px-2 font-medium">File</th>
                  <th className="text-right py-2 px-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const isDynamicsInvoice = (invoice as any).source === 'dynamics365';
                  return (
                  <tr key={invoice.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-2">
                      {isDynamicsInvoice ? (
                        <a
                          href={(invoice as any).externalUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 flex items-center gap-1"
                          title="View in Dynamics 365"
                          data-testid={`link-dynamics-invoice-${invoice.id}`}
                        >
                          <CloudDownload className="h-4 w-4" />
                        </a>
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      )}
                    </td>
                    <td className="py-2 px-2">{invoice.invoiceNumber || '-'}</td>
                    <td className="py-2 px-2">{invoice.title}</td>
                    <td className="py-2 px-2">{invoice.vendorName || '-'}</td>
                    <td className="py-2 px-2 text-right">{formatCurrency(invoice.amount, invoice.currency)}</td>
                    <td className="py-2 px-2">
                      <Badge className={cn("text-xs", statusColors[invoice.status || 'Draft'])}>
                        {invoice.status}
                      </Badge>
                    </td>
                    <td className="py-2 px-2">
                      {invoice.dueDate ? format(new Date(invoice.dueDate), 'MMM d, yyyy') : '-'}
                    </td>
                    <td className="py-2 px-2">
                      {invoice.fileUrl ? (
                        <a 
                          href={getFileUrl(invoice) || '#'} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                          data-testid={`link-invoice-file-${invoice.id}`}
                        >
                          <FileText className="h-3 w-3" />
                          <span className="truncate max-w-[80px]">{invoice.fileName || 'File'}</span>
                        </a>
                      ) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setNotesInvoice(invoice)}
                          data-testid={`button-notes-invoice-${invoice.id}`}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        {isDynamicsInvoice ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => resyncMutation.mutate(invoice)}
                            disabled={resyncMutation.isPending}
                            title="Resync from Dynamics 365"
                            data-testid={`button-resync-invoice-${invoice.id}`}
                          >
                            <RefreshCw className={cn("h-4 w-4", resyncMutation.isPending && "animate-spin")} />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(invoice)}
                            data-testid={`button-edit-invoice-${invoice.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setInvoiceToDelete(invoice)}
                          data-testid={`button-delete-invoice-${invoice.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingInvoice(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? 'Edit Invoice' : 'Add Invoice'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(new FormData(e.currentTarget)); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <Input id="invoiceNumber" name="invoiceNumber" defaultValue={editingInvoice?.invoiceNumber || ''} data-testid="input-invoice-number" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue={editingInvoice?.status || 'Draft'}>
                  <SelectTrigger data-testid="select-invoice-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Sent">Sent</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" name="title" defaultValue={editingInvoice?.title || ''} required data-testid="input-invoice-title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" defaultValue={editingInvoice?.description || ''} rows={2} data-testid="input-invoice-description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" name="amount" type="number" step="0.01" defaultValue={editingInvoice?.amount || ''} data-testid="input-invoice-amount" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select name="currency" defaultValue={editingInvoice?.currency || 'USD'}>
                  <SelectTrigger data-testid="select-invoice-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="AUD">AUD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vendorName">Vendor Name</Label>
                <Input id="vendorName" name="vendorName" defaultValue={editingInvoice?.vendorName || ''} data-testid="input-vendor-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendorEmail">Vendor Email</Label>
                <Input id="vendorEmail" name="vendorEmail" type="email" defaultValue={editingInvoice?.vendorEmail || ''} data-testid="input-vendor-email" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceDate">Invoice Date</Label>
                <Input id="invoiceDate" name="invoiceDate" type="date" defaultValue={editingInvoice?.invoiceDate || ''} data-testid="input-invoice-date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input id="dueDate" name="dueDate" type="date" defaultValue={editingInvoice?.dueDate || ''} data-testid="input-due-date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceFile">Attachment</Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="invoiceFile" 
                  type="file" 
                  onChange={handleFileChange}
                  className="flex-1"
                  disabled={isUploading}
                  data-testid="input-invoice-file"
                />
                {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              {uploadedFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span className="truncate">{uploadedFile.name}</span>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5"
                    onClick={() => setUploadedFile(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-invoice">
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingInvoice ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!notesInvoice} onOpenChange={(open) => { if (!open) { setNotesInvoice(null); setNewNote(''); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Invoice Notes - {notesInvoice?.invoiceNumber || notesInvoice?.title}</DialogTitle>
            <DialogDescription>
              Track notes and status changes for this invoice
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Textarea
                placeholder="Add a note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={2}
                data-testid="input-invoice-note"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (notesInvoice && newNote.trim()) {
                    addNoteMutation.mutate({ invoiceId: notesInvoice.id, note: newNote.trim() });
                  }
                }}
                disabled={!newNote.trim() || addNoteMutation.isPending}
                data-testid="button-add-note"
              >
                {addNoteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Note
              </Button>
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-3">
              {invoiceNotes.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No notes yet
                </div>
              ) : (
                invoiceNotes.map((note) => (
                  <div key={note.id} className="border rounded-md p-3 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{note.userName}</span>
                      <span>{note.createdAt ? format(new Date(note.createdAt), 'MMM d, yyyy h:mm a') : ''}</span>
                    </div>
                    {note.status && (
                      <Badge variant="outline" className="text-xs">{note.status}</Badge>
                    )}
                    <p className="text-sm">{note.note}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!invoiceToDelete} onOpenChange={(open) => { if (!open) setInvoiceToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-invoice">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (invoiceToDelete) {
                  deleteMutation.mutate(invoiceToDelete.id);
                  setInvoiceToDelete(null);
                }
              }}
              data-testid="button-confirm-delete-invoice"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={isDynamicsImportOpen} onOpenChange={(open) => { setIsDynamicsImportOpen(open); if (!open) { setSelectedDynamicsInvoice(null); setDynamicsSearch(''); } }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Import Invoice from Dynamics 365</DialogTitle>
            <DialogDescription>
              Select an invoice from Dynamics 365 Sales Hub to import
            </DialogDescription>
          </DialogHeader>
          
          {!dynamics365Status?.connected && !dynamics365Status?.needsRefresh ? (
            <div className="space-y-4 py-4">
              <p className="text-muted-foreground text-center">
                Connect to Dynamics 365 to import invoices
              </p>
              
              {!dynamics365Status?.environmentUrl && (
                <div className="space-y-2">
                  <Label htmlFor="dynamics365EnvUrl">Dynamics 365 Environment URL</Label>
                  <Input
                    id="dynamics365EnvUrl"
                    placeholder="https://yourorg.crm.dynamics.com"
                    value={dynamics365EnvUrl}
                    onChange={(e) => setDynamics365EnvUrl(e.target.value)}
                    data-testid="input-dynamics365-env-url"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your Dynamics 365 environment URL (e.g., https://yourorg.crm.dynamics.com)
                  </p>
                </div>
              )}
              
              <div className="text-center">
                <Button 
                  onClick={async () => {
                    try {
                      if (!dynamics365Status?.environmentUrl && dynamics365EnvUrl) {
                        const setEnvRes = await apiRequest('POST', '/api/dynamics365/set-environment', { 
                          environmentUrl: dynamics365EnvUrl,
                          organizationId 
                        });
                        if (!setEnvRes.ok) {
                          const errorData = await setEnvRes.json();
                          throw new Error(errorData.message || "Invalid environment URL");
                        }
                      } else if (!dynamics365Status?.environmentUrl && !dynamics365EnvUrl) {
                        toast({ title: "Error", description: "Please enter your Dynamics 365 environment URL", variant: "destructive" });
                        return;
                      }
                      
                      const res = await apiRequest('POST', '/api/dynamics365/connect', { returnUrl: window.location.pathname, organizationId });
                      const { authUrl } = await res.json();
                      if (authUrl) {
                        window.location.href = authUrl;
                      }
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message || "Failed to connect to Dynamics 365", variant: "destructive" });
                    }
                  }}
                  data-testid="button-connect-dynamics"
                >
                  Connect to Dynamics 365
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search invoices..."
                  value={dynamicsSearch}
                  onChange={(e) => setDynamicsSearch(e.target.value)}
                  data-testid="input-dynamics-search"
                />
                <Button variant="outline" size="icon" onClick={() => refetchDynamicsInvoices()} data-testid="button-refresh-dynamics">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="max-h-[300px] overflow-y-auto border rounded-md">
                {isDynamicsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : !dynamics365Invoices?.invoices?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No invoices found in Dynamics 365
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium">Invoice #</th>
                        <th className="text-left py-2 px-3 font-medium">Name</th>
                        <th className="text-left py-2 px-3 font-medium">Customer</th>
                        <th className="text-right py-2 px-3 font-medium">Amount</th>
                        <th className="text-left py-2 px-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dynamics365Invoices.invoices.map((inv) => (
                        <tr 
                          key={inv.id} 
                          className={cn(
                            "border-b cursor-pointer hover:bg-muted/50",
                            selectedDynamicsInvoice?.id === inv.id && "bg-primary/10"
                          )}
                          onClick={() => setSelectedDynamicsInvoice(inv)}
                          data-testid={`row-dynamics-invoice-${inv.id}`}
                        >
                          <td className="py-2 px-3">{inv.invoiceNumber || '-'}</td>
                          <td className="py-2 px-3">{inv.name}</td>
                          <td className="py-2 px-3">{inv.customerName || '-'}</td>
                          <td className="py-2 px-3 text-right">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(inv.amount || 0)}
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant="outline" className="text-xs">{inv.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              
              {selectedDynamicsInvoice && (
                <div className="p-3 border rounded-md bg-muted/30">
                  <h4 className="font-medium mb-2">Selected Invoice</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Number:</span> {selectedDynamicsInvoice.invoiceNumber}</div>
                    <div><span className="text-muted-foreground">Amount:</span> {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(selectedDynamicsInvoice.amount || 0)}</div>
                    <div className="col-span-2"><span className="text-muted-foreground">Name:</span> {selectedDynamicsInvoice.name}</div>
                    {selectedDynamicsInvoice.description && (
                      <div className="col-span-2"><span className="text-muted-foreground">Description:</span> {selectedDynamicsInvoice.description}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDynamicsImportOpen(false)}>Cancel</Button>
            <Button 
              disabled={!selectedDynamicsInvoice || createMutation.isPending}
              onClick={() => {
                if (selectedDynamicsInvoice && dynamics365Status?.environmentUrl) {
                  const envUrl = dynamics365Status.environmentUrl.replace(/\/$/, '');
                  const data: Partial<ProjectInvoice> & { source?: string; externalId?: string; externalUrl?: string } = {
                    invoiceNumber: selectedDynamicsInvoice.invoiceNumber,
                    title: selectedDynamicsInvoice.name,
                    description: selectedDynamicsInvoice.description || '',
                    amount: String(selectedDynamicsInvoice.amount || 0),
                    currency: 'USD',
                    status: selectedDynamicsInvoice.status === 'Paid' ? 'Paid' : 
                            selectedDynamicsInvoice.status === 'Cancelled' ? 'Cancelled' : 'Draft',
                    dueDate: selectedDynamicsInvoice.dueDate,
                    vendorName: selectedDynamicsInvoice.customerName,
                    source: 'dynamics365',
                    externalId: selectedDynamicsInvoice.id,
                    externalUrl: `${envUrl}/main.aspx?etn=invoice&id=${selectedDynamicsInvoice.id}&pagetype=entityrecord`,
                  };
                  createMutation.mutate(data, {
                    onSuccess: () => {
                      setIsDynamicsImportOpen(false);
                      setSelectedDynamicsInvoice(null);
                      setDynamicsSearch('');
                    }
                  });
                }
              }}
              data-testid="button-import-selected"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
