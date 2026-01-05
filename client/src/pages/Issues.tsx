import { useState } from "react";
import { useAllIssues, useCreateIssue, useUpdateIssue, useDeleteIssue } from "@/hooks/use-issues";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Plus, Trash2, Bug, Sparkles, ListTodo, HelpCircle } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertIssueSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Link } from "wouter";

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
  const { data: issues, isLoading } = useAllIssues();
  const { data: projects } = useProjects(currentOrganization?.id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const createIssue = useCreateIssue();
  const deleteIssue = useDeleteIssue();
  const { toast } = useToast();

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
      type: "Bug",
      assignee: ""
    }
  });

  const onSubmit = (data: any) => {
    createIssue.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Issue created successfully" });
        setIsDialogOpen(false);
        form.reset({
          projectId: undefined as unknown as number,
          title: "",
          description: "",
          priority: "Medium",
          status: "Open",
          type: "Bug",
          assignee: ""
        });
      }
    });
  };

  const filteredIssues = issues?.filter(issue => {
    const matchesSearch = issue.title.toLowerCase().includes(search.toLowerCase()) ||
      issue.description?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || issue.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || issue.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
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
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-page-title">Issues</h1>
          <p className="mt-1 text-muted-foreground">Track and resolve project issues across all initiatives.</p>
        </div>
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
                <Label>Project</Label>
                <Controller
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString()}>
                      <SelectTrigger data-testid="select-project">
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects?.map(p => (
                          <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...form.register("title")} data-testid="input-issue-title" placeholder="Brief description of the issue" />
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
              <div className="space-y-2">
                <Label>Assignee</Label>
                <Input {...form.register("assignee")} data-testid="input-issue-assignee" placeholder="Name of assignee" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createIssue.isPending} data-testid="button-submit-issue">
                  {createIssue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Issue
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10 border-slate-200"
            placeholder="Search issues..."
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
          <CardTitle>All Issues</CardTitle>
          <CardDescription>{filteredIssues?.length || 0} issues found</CardDescription>
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
                  className="flex items-start justify-between rounded-lg border p-4 hover:bg-slate-50 transition-colors"
                  data-testid={`card-issue-${issue.id}`}
                >
                  <div className="flex gap-4">
                    <div className="mt-0.5">
                      <TypeIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold" data-testid={`text-issue-title-${issue.id}`}>{issue.title}</span>
                        <Badge variant="outline" className={cn("text-xs", priorityColors[issue.priority as keyof typeof priorityColors])}>
                          {issue.priority}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs", statusColors[issue.status as keyof typeof statusColors])}>
                          {issue.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{issue.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <Link href={`/projects/${issue.projectId}`}>
                          <span className="hover:text-primary cursor-pointer">{getProjectName(issue.projectId)}</span>
                        </Link>
                        {issue.assignee && <span>Assigned to: {issue.assignee}</span>}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteIssue.mutate({ id: issue.id, projectId: issue.projectId })}
                    data-testid={`button-delete-issue-${issue.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                  </Button>
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
    </div>
  );
}
