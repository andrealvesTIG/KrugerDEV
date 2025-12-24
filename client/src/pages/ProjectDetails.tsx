import { useState } from "react";
import { useRoute } from "wouter";
import { useProject, useUpdateProject } from "@/hooks/use-projects";
import { useRisks, useCreateRisk, useDeleteRisk } from "@/hooks/use-risks";
import { useMilestones, useCreateMilestone, useUpdateMilestone, useDeleteMilestone } from "@/hooks/use-milestones";
import { useIssues, useCreateIssue, useUpdateIssue, useDeleteIssue } from "@/hooks/use-issues";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, CheckSquare, Calendar as CalendarIcon, DollarSign, Plus, Trash2, Bug, Sparkles, ListTodo, HelpCircle, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRiskSchema, insertMilestoneSchema, insertIssueSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function ProjectDetails() {
  const [, params] = useRoute("/projects/:id");
  const id = parseInt(params?.id || "0");
  const { data: project, isLoading } = useProject(id);
  const { mutate: updateProject } = useUpdateProject();
  const { toast } = useToast();

  if (isLoading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!project) return <div>Project not found</div>;

  const handleStatusChange = (status: string) => {
    updateProject({ id: project.id, status }, {
      onSuccess: () => toast({ title: "Status Updated", description: `Project status changed to ${status}` })
    });
  };

  const handleHealthChange = (health: string) => {
    updateProject({ id: project.id, health }, {
      onSuccess: () => toast({ title: "Health Updated", description: `Project health changed to ${health}` })
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-display font-bold text-slate-900">{project.name}</h1>
            <Badge className={cn(
              "text-sm px-3 py-1",
              project.health === 'Green' ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" :
              project.health === 'Yellow' ? "bg-amber-100 text-amber-800 hover:bg-amber-100" :
              "bg-rose-100 text-rose-800 hover:bg-rose-100"
            )}>
              {project.health} Health
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-slate-500">{project.description}</p>
        </div>
        <div className="flex gap-3">
           <Select value={project.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Initiation">Initiation</SelectItem>
              <SelectItem value="Planning">Planning</SelectItem>
              <SelectItem value="Execution">Execution</SelectItem>
              <SelectItem value="Monitoring">Monitoring</SelectItem>
              <SelectItem value="Closing">Closing</SelectItem>
            </SelectContent>
          </Select>
          
           <Select value={project.health || "Green"} onValueChange={handleHealthChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Green">Green</SelectItem>
              <SelectItem value="Yellow">Yellow</SelectItem>
              <SelectItem value="Red">Red</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Budget</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center"><DollarSign className="h-5 w-5 mr-1 text-slate-400" />{Number(project.budget).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Progress</CardTitle></CardHeader>
          <CardContent>
             <div className="text-2xl font-bold">{project.completionPercentage}%</div>
             <Progress value={project.completionPercentage || 0} className="h-2 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Start Date</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center"><CalendarIcon className="h-5 w-5 mr-2 text-slate-400" />{project.startDate ? format(new Date(project.startDate), 'MMM d, yyyy') : '-'}</div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">End Date</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center"><CalendarIcon className="h-5 w-5 mr-2 text-slate-400" />{project.endDate ? format(new Date(project.endDate), 'MMM d, yyyy') : '-'}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="summary" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Project Summary</TabsTrigger>
          <TabsTrigger value="milestones" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Milestones</TabsTrigger>
          <TabsTrigger value="risks" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Risks Log</TabsTrigger>
          <TabsTrigger value="issues" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Issues</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="summary">
            <ProjectSummaryTab project={project} onUpdate={updateProject} />
          </TabsContent>
          <TabsContent value="milestones">
            <MilestonesTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="risks">
            <RisksTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="issues">
            <IssuesTab projectId={project.id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function RisksTab({ projectId }: { projectId: number }) {
  const { data: risks, isLoading } = useRisks(projectId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const createRisk = useCreateRisk();
  const deleteRisk = useDeleteRisk();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertRiskSchema),
    defaultValues: {
      projectId,
      title: "",
      description: "",
      probability: "Medium",
      impact: "Medium",
      status: "Open"
    }
  });

  const onSubmit = (data: any) => {
    createRisk.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Risk added" });
        setIsDialogOpen(false);
        form.reset({ projectId, title: "", description: "", probability: "Medium", impact: "Medium", status: "Open" });
      }
    });
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Project Risks</CardTitle>
          <CardDescription>Track and mitigate potential issues.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Risk</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New Risk</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...form.register("title")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Probability</Label>
                  <Controller control={form.control} name="probability" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Low">Low</SelectItem>
                         <SelectItem value="Medium">Medium</SelectItem>
                         <SelectItem value="High">High</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>Impact</Label>
                   <Controller control={form.control} name="impact" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Low">Low</SelectItem>
                         <SelectItem value="Medium">Medium</SelectItem>
                         <SelectItem value="High">High</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input {...form.register("description")} />
              </div>
              <DialogFooter><Button type="submit">Save Risk</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {risks?.map(risk => (
            <div key={risk.id} className="flex items-start justify-between rounded-lg border p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                   <span className="font-semibold">{risk.title}</span>
                   <Badge variant="outline" className={cn(
                     risk.probability === 'High' ? "bg-red-50 text-red-700" : "bg-slate-50"
                   )}>{risk.probability} Prob</Badge>
                   <Badge variant="outline" className={cn(
                     risk.impact === 'High' ? "bg-red-50 text-red-700" : "bg-slate-50"
                   )}>{risk.impact} Impact</Badge>
                </div>
                <p className="text-sm text-slate-500">{risk.description}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => deleteRisk.mutate({id: risk.id, projectId})}><Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" /></Button>
            </div>
          ))}
          {risks?.length === 0 && <div className="text-center py-8 text-slate-500">No risks recorded.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function MilestonesTab({ projectId }: { projectId: number }) {
  const { data: milestones, isLoading } = useMilestones(projectId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const deleteMilestone = useDeleteMilestone();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertMilestoneSchema),
    defaultValues: {
      projectId,
      title: "",
      dueDate: format(new Date(), 'yyyy-MM-dd'),
      completed: false
    }
  });

  const onSubmit = (data: any) => {
    createMilestone.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Milestone added" });
        setIsDialogOpen(false);
        form.reset({ projectId, title: "", dueDate: format(new Date(), 'yyyy-MM-dd'), completed: false });
      }
    });
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Milestones</CardTitle>
          <CardDescription>Key deliverables and dates.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Milestone</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Milestone</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...form.register("title")} />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" {...form.register("dueDate")} />
              </div>
              <DialogFooter><Button type="submit">Save Milestone</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {milestones?.map(ms => (
            <div key={ms.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div 
                  className={cn("h-5 w-5 rounded border cursor-pointer flex items-center justify-center transition-colors", ms.completed ? "bg-primary border-primary text-white" : "border-slate-300")}
                  onClick={() => updateMilestone.mutate({ id: ms.id, projectId, completed: !ms.completed })}
                >
                  {ms.completed && <CheckSquare className="h-3.5 w-3.5" />}
                </div>
                <div className={cn(ms.completed && "line-through text-slate-400")}>
                  <p className="font-medium text-sm">{ms.title}</p>
                  <p className="text-xs text-slate-500">Due: {format(new Date(ms.dueDate), 'MMM d, yyyy')}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => deleteMilestone.mutate({id: ms.id, projectId})}><Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" /></Button>
            </div>
          ))}
          {milestones?.length === 0 && <div className="text-center py-8 text-slate-500">No milestones set.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

const priorityColors = {
  Low: "bg-slate-100 text-slate-700",
  Medium: "bg-blue-100 text-blue-700",
  High: "bg-amber-100 text-amber-700",
  Critical: "bg-rose-100 text-rose-700",
};

const statusColors = {
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

function IssuesTab({ projectId }: { projectId: number }) {
  const { data: issues, isLoading } = useIssues(projectId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertIssueSchema),
    defaultValues: {
      projectId,
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
        toast({ title: "Success", description: "Issue created" });
        setIsDialogOpen(false);
        form.reset({ projectId, title: "", description: "", priority: "Medium", status: "Open", type: "Bug", assignee: "" });
      }
    });
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Project Issues</CardTitle>
          <CardDescription>Track bugs, tasks, and enhancements.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button size="sm" data-testid="button-add-issue"><Plus className="mr-2 h-4 w-4" /> Add Issue</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>Add New Issue</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
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
              <div className="space-y-2">
                <Label>Description</Label>
                <Input {...form.register("description")} data-testid="input-issue-description" />
              </div>
              <div className="space-y-2">
                <Label>Assignee</Label>
                <Input {...form.register("assignee")} data-testid="input-issue-assignee" placeholder="Name of assignee" />
              </div>
              <DialogFooter><Button type="submit" data-testid="button-save-issue">Save Issue</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {issues?.map(issue => {
            const TypeIcon = typeIcons[issue.type as keyof typeof typeIcons] || Bug;
            return (
              <div key={issue.id} className="flex items-start justify-between rounded-lg border p-4" data-testid={`card-issue-${issue.id}`}>
                <div className="flex gap-3">
                  <div className="mt-0.5">
                    <TypeIcon className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{issue.title}</span>
                      <Badge variant="outline" className={cn("text-xs", priorityColors[issue.priority as keyof typeof priorityColors])}>
                        {issue.priority}
                      </Badge>
                      <Badge variant="outline" className={cn("text-xs", statusColors[issue.status as keyof typeof statusColors])}>
                        {issue.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500">{issue.description}</p>
                    {issue.assignee && <p className="text-xs text-slate-400">Assigned to: {issue.assignee}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Select 
                    value={issue.status || "Open"} 
                    onValueChange={(status) => updateIssue.mutate({ id: issue.id, projectId, status })}
                  >
                    <SelectTrigger className="w-[120px] h-8 text-xs" data-testid={`select-status-${issue.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Resolved">Resolved</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => deleteIssue.mutate({id: issue.id, projectId})} data-testid={`button-delete-issue-${issue.id}`}>
                    <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
          {issues?.length === 0 && <div className="text-center py-8 text-slate-500">No issues recorded.</div>}
        </div>
      </CardContent>
    </Card>
  );
}
