import { useState } from "react";
import { useRoute } from "wouter";
import { useProject, useUpdateProject } from "@/hooks/use-projects";
import { useRisks, useCreateRisk, useDeleteRisk } from "@/hooks/use-risks";
import { useMilestones, useCreateMilestone, useUpdateMilestone, useDeleteMilestone } from "@/hooks/use-milestones";
import { useIssues, useCreateIssue, useUpdateIssue, useDeleteIssue } from "@/hooks/use-issues";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, CheckSquare, Calendar as CalendarIcon, DollarSign, Plus, Trash2, Bug, Sparkles, ListTodo, HelpCircle, FileText, Pencil, Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { format, addDays } from "date-fns";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRiskSchema, insertMilestoneSchema, insertIssueSchema, insertTaskSchema } from "@shared/schema";
import type { Milestone, Task } from "@shared/schema";
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
          <TabsTrigger value="tasks" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Tasks</TabsTrigger>
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
          <TabsContent value="tasks">
            <TasksTab projectId={project.id} />
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

function ProjectSummaryTab({ project, onUpdate }: { project: any; onUpdate: any }) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  
  const form = useForm({
    defaultValues: {
      name: project.name || "",
      description: project.description || "",
      status: project.status || "Initiation",
      priority: project.priority || "Medium",
      startDate: project.startDate ? format(new Date(project.startDate), 'yyyy-MM-dd') : "",
      endDate: project.endDate ? format(new Date(project.endDate), 'yyyy-MM-dd') : "",
      budget: project.budget || "0",
      health: project.health || "Green",
      completionPercentage: project.completionPercentage || 0,
    }
  });

  const onSubmit = (data: any) => {
    onUpdate({ id: project.id, ...data }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Project updated successfully" });
        setIsEditing(false);
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Project Summary</CardTitle>
          <CardDescription>View and edit project details</CardDescription>
        </div>
        <Button 
          variant={isEditing ? "outline" : "default"} 
          onClick={() => setIsEditing(!isEditing)}
          data-testid="button-edit-project"
        >
          {isEditing ? "Cancel" : "Edit Project"}
        </Button>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input {...form.register("name")} data-testid="input-project-name" />
              </div>
              <div className="space-y-2">
                <Label>Budget</Label>
                <Input type="number" {...form.register("budget")} data-testid="input-project-budget" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Controller control={form.control} name="status" render={({field}) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Initiation">Initiation</SelectItem>
                      <SelectItem value="Planning">Planning</SelectItem>
                      <SelectItem value="Execution">Execution</SelectItem>
                      <SelectItem value="Monitoring">Monitoring</SelectItem>
                      <SelectItem value="Closing">Closing</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Controller control={form.control} name="priority" render={({field}) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" {...form.register("startDate")} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" {...form.register("endDate")} />
              </div>
              <div className="space-y-2">
                <Label>Health</Label>
                <Controller control={form.control} name="health" render={({field}) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Green">Green</SelectItem>
                      <SelectItem value="Yellow">Yellow</SelectItem>
                      <SelectItem value="Red">Red</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-2">
                <Label>Completion (%)</Label>
                <Input type="number" min="0" max="100" {...form.register("completionPercentage", { valueAsNumber: true })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea {...form.register("description")} className="min-h-[100px]" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" data-testid="button-save-project">Save Changes</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <Label className="text-xs text-slate-500">Project Name</Label>
                <p className="font-medium">{project.name}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Status</Label>
                <p className="font-medium">{project.status}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Priority</Label>
                <p className="font-medium">{project.priority}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Budget</Label>
                <p className="font-medium">${Number(project.budget).toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Health</Label>
                <Badge className={cn(
                  project.health === 'Green' ? "bg-emerald-100 text-emerald-800" :
                  project.health === 'Yellow' ? "bg-amber-100 text-amber-800" :
                  "bg-rose-100 text-rose-800"
                )}>{project.health}</Badge>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Completion</Label>
                <p className="font-medium">{project.completionPercentage}%</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Start Date</Label>
                <p className="font-medium">{project.startDate ? format(new Date(project.startDate), 'MMM d, yyyy') : 'Not set'}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">End Date</Label>
                <p className="font-medium">{project.endDate ? format(new Date(project.endDate), 'MMM d, yyyy') : 'Not set'}</p>
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Description</Label>
              <p className="mt-1 text-slate-600">{project.description || 'No description provided.'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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

function MilestoneRow({ milestone, projectId, onUpdate, onDelete }: { 
  milestone: Milestone; 
  projectId: number; 
  onUpdate: any; 
  onDelete: any;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const [dueDate, setDueDate] = useState(format(new Date(milestone.dueDate), 'yyyy-MM-dd'));

  const handleSave = () => {
    onUpdate.mutate({ 
      id: milestone.id, 
      projectId, 
      title, 
      dueDate: dueDate || null 
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTitle(milestone.title);
    setDueDate(format(new Date(milestone.dueDate), 'yyyy-MM-dd'));
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <tr className="border-b" data-testid={`row-milestone-edit-${milestone.id}`}>
        <td className="p-2">
          <div 
            className={cn("h-5 w-5 rounded border cursor-pointer flex items-center justify-center transition-colors", milestone.completed ? "bg-primary border-primary text-white" : "border-slate-300")}
            onClick={() => onUpdate.mutate({ id: milestone.id, projectId, completed: !milestone.completed })}
          >
            {milestone.completed && <Check className="h-3.5 w-3.5" />}
          </div>
        </td>
        <td className="p-2">
          <Input 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            className="h-8"
            data-testid="input-milestone-title-edit"
          />
        </td>
        <td className="p-2">
          <Input 
            type="date" 
            value={dueDate} 
            onChange={(e) => setDueDate(e.target.value)} 
            className="h-8 w-40"
            data-testid="input-milestone-date-edit"
          />
        </td>
        <td className="p-2">
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={handleSave} data-testid="button-save-milestone-edit">
              <Check className="h-4 w-4 text-emerald-600" />
            </Button>
            <Button size="icon" variant="ghost" onClick={handleCancel} data-testid="button-cancel-milestone-edit">
              <X className="h-4 w-4 text-slate-400" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" data-testid={`row-milestone-${milestone.id}`}>
      <td className="p-2">
        <div 
          className={cn("h-5 w-5 rounded border cursor-pointer flex items-center justify-center transition-colors", milestone.completed ? "bg-primary border-primary text-white" : "border-slate-300")}
          onClick={() => onUpdate.mutate({ id: milestone.id, projectId, completed: !milestone.completed })}
          data-testid={`checkbox-milestone-${milestone.id}`}
        >
          {milestone.completed && <Check className="h-3.5 w-3.5" />}
        </div>
      </td>
      <td className={cn("p-2 font-medium text-sm", milestone.completed && "line-through text-slate-400")}>
        {milestone.title}
      </td>
      <td className="p-2 text-sm text-muted-foreground">
        {format(new Date(milestone.dueDate), 'MMM d, yyyy')}
      </td>
      <td className="p-2">
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)} data-testid={`button-edit-milestone-${milestone.id}`}>
            <Pencil className="h-4 w-4 text-slate-400" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onDelete.mutate({ id: milestone.id, projectId })} data-testid={`button-delete-milestone-${milestone.id}`}>
            <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function MilestonesTab({ projectId }: { projectId: number }) {
  const { data: milestones, isLoading } = useMilestones(projectId);
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const deleteMilestone = useDeleteMilestone();
  const { toast } = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));

  const handleAddMilestone = () => {
    if (!newTitle.trim()) return;
    createMilestone.mutate({
      projectId,
      title: newTitle,
      dueDate: newDueDate || format(new Date(), 'yyyy-MM-dd'),
      completed: false
    }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Milestone added" });
        setNewTitle("");
        setNewDueDate(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
        setIsAdding(false);
      }
    });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Milestones</CardTitle>
          <CardDescription>Key deliverables and dates. Click the pencil to edit inline.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setIsAdding(true)} disabled={isAdding} data-testid="button-add-milestone">
          <Plus className="mr-2 h-4 w-4" /> Add Milestone
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="p-2 w-10"></th>
                <th className="p-2 text-left text-sm font-medium text-muted-foreground">Title</th>
                <th className="p-2 text-left text-sm font-medium text-muted-foreground w-40">Due Date</th>
                <th className="p-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {isAdding && (
                <tr className="border-b bg-muted/30" data-testid="row-milestone-new">
                  <td className="p-2">
                    <div className="h-5 w-5 rounded border border-slate-300" />
                  </td>
                  <td className="p-2">
                    <Input 
                      value={newTitle} 
                      onChange={(e) => setNewTitle(e.target.value)} 
                      placeholder="Milestone title..."
                      className="h-8"
                      autoFocus
                      data-testid="input-milestone-title-new"
                    />
                  </td>
                  <td className="p-2">
                    <Input 
                      type="date" 
                      value={newDueDate} 
                      onChange={(e) => setNewDueDate(e.target.value)} 
                      className="h-8 w-40"
                      data-testid="input-milestone-date-new"
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={handleAddMilestone} disabled={!newTitle.trim()} data-testid="button-save-milestone-new">
                        <Check className="h-4 w-4 text-emerald-600" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { setIsAdding(false); setNewTitle(""); }} data-testid="button-cancel-milestone-new">
                        <X className="h-4 w-4 text-slate-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {milestones?.map(ms => (
                <MilestoneRow 
                  key={ms.id} 
                  milestone={ms} 
                  projectId={projectId} 
                  onUpdate={updateMilestone} 
                  onDelete={deleteMilestone} 
                />
              ))}
            </tbody>
          </table>
          {!isAdding && milestones?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No milestones set. Click "Add Milestone" to create one.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskRow({ task, projectId, onUpdate, onDelete }: { 
  task: Task; 
  projectId: number; 
  onUpdate: any; 
  onDelete: any;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState(task.status || "To Do");
  const [priority, setPriority] = useState(task.priority || "Medium");
  const [assignee, setAssignee] = useState(task.assignee || "");
  const [dueDate, setDueDate] = useState(task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : "");

  const handleSave = () => {
    onUpdate.mutate({ 
      id: task.id, 
      projectId, 
      title, 
      status, 
      priority, 
      assignee: assignee || null,
      dueDate: dueDate || null 
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTitle(task.title);
    setStatus(task.status || "To Do");
    setPriority(task.priority || "Medium");
    setAssignee(task.assignee || "");
    setDueDate(task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : "");
    setIsEditing(false);
  };

  const statusColors: Record<string, string> = {
    "To Do": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    "Done": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    "Blocked": "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  };

  const priorityColors: Record<string, string> = {
    Low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    Medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    High: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    Critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  };

  if (isEditing) {
    return (
      <tr className="border-b" data-testid={`row-task-edit-${task.id}`}>
        <td className="p-2">
          <Input 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            className="h-8"
            data-testid="input-task-title-edit"
          />
        </td>
        <td className="p-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-28" data-testid="select-task-status-edit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="To Do">To Do</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Done">Done</SelectItem>
              <SelectItem value="Blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
        </td>
        <td className="p-2">
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="h-8 w-24" data-testid="select-task-priority-edit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </td>
        <td className="p-2">
          <Input 
            value={assignee} 
            onChange={(e) => setAssignee(e.target.value)} 
            placeholder="Assignee"
            className="h-8 w-28"
            data-testid="input-task-assignee-edit"
          />
        </td>
        <td className="p-2">
          <Input 
            type="date" 
            value={dueDate} 
            onChange={(e) => setDueDate(e.target.value)} 
            className="h-8 w-36"
            data-testid="input-task-date-edit"
          />
        </td>
        <td className="p-2">
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={handleSave} data-testid="button-save-task-edit">
              <Check className="h-4 w-4 text-emerald-600" />
            </Button>
            <Button size="icon" variant="ghost" onClick={handleCancel} data-testid="button-cancel-task-edit">
              <X className="h-4 w-4 text-slate-400" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" data-testid={`row-task-${task.id}`}>
      <td className="p-2 font-medium text-sm">{task.title}</td>
      <td className="p-2">
        <Badge className={cn("text-xs", statusColors[task.status || "To Do"])}>{task.status}</Badge>
      </td>
      <td className="p-2">
        <Badge className={cn("text-xs", priorityColors[task.priority || "Medium"])}>{task.priority}</Badge>
      </td>
      <td className="p-2 text-sm text-muted-foreground">{task.assignee || "-"}</td>
      <td className="p-2 text-sm text-muted-foreground">
        {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : "-"}
      </td>
      <td className="p-2">
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)} data-testid={`button-edit-task-${task.id}`}>
            <Pencil className="h-4 w-4 text-slate-400" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onDelete.mutate({ id: task.id, projectId })} data-testid={`button-delete-task-${task.id}`}>
            <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function TasksTab({ projectId }: { projectId: number }) {
  const { data: tasks, isLoading } = useTasks(projectId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { toast } = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStatus, setNewStatus] = useState("To Do");
  const [newPriority, setNewPriority] = useState("Medium");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  const handleAddTask = () => {
    if (!newTitle.trim()) return;
    createTask.mutate({
      projectId,
      title: newTitle,
      status: newStatus,
      priority: newPriority,
      assignee: newAssignee || null,
      dueDate: newDueDate || null,
      description: ""
    }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Task added" });
        setNewTitle("");
        setNewStatus("To Do");
        setNewPriority("Medium");
        setNewAssignee("");
        setNewDueDate("");
        setIsAdding(false);
      }
    });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>Project tasks and assignments. Click the pencil to edit inline.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setIsAdding(true)} disabled={isAdding} data-testid="button-add-task">
          <Plus className="mr-2 h-4 w-4" /> Add Task
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="p-2 text-left text-sm font-medium text-muted-foreground">Title</th>
                <th className="p-2 text-left text-sm font-medium text-muted-foreground w-28">Status</th>
                <th className="p-2 text-left text-sm font-medium text-muted-foreground w-24">Priority</th>
                <th className="p-2 text-left text-sm font-medium text-muted-foreground w-28">Assignee</th>
                <th className="p-2 text-left text-sm font-medium text-muted-foreground w-36">Due Date</th>
                <th className="p-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {isAdding && (
                <tr className="border-b bg-muted/30" data-testid="row-task-new">
                  <td className="p-2">
                    <Input 
                      value={newTitle} 
                      onChange={(e) => setNewTitle(e.target.value)} 
                      placeholder="Task title..."
                      className="h-8"
                      autoFocus
                      data-testid="input-task-title-new"
                    />
                  </td>
                  <td className="p-2">
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger className="h-8 w-28" data-testid="select-task-status-new">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="To Do">To Do</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Done">Done</SelectItem>
                        <SelectItem value="Blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    <Select value={newPriority} onValueChange={setNewPriority}>
                      <SelectTrigger className="h-8 w-24" data-testid="select-task-priority-new">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    <Input 
                      value={newAssignee} 
                      onChange={(e) => setNewAssignee(e.target.value)} 
                      placeholder="Assignee"
                      className="h-8 w-28"
                      data-testid="input-task-assignee-new"
                    />
                  </td>
                  <td className="p-2">
                    <Input 
                      type="date" 
                      value={newDueDate} 
                      onChange={(e) => setNewDueDate(e.target.value)} 
                      className="h-8 w-36"
                      data-testid="input-task-date-new"
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={handleAddTask} disabled={!newTitle.trim()} data-testid="button-save-task-new">
                        <Check className="h-4 w-4 text-emerald-600" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { setIsAdding(false); setNewTitle(""); }} data-testid="button-cancel-task-new">
                        <X className="h-4 w-4 text-slate-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {tasks?.map(task => (
                <TaskRow 
                  key={task.id} 
                  task={task} 
                  projectId={projectId} 
                  onUpdate={updateTask} 
                  onDelete={deleteTask} 
                />
              ))}
            </tbody>
          </table>
          {!isAdding && tasks?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No tasks created. Click "Add Task" to create one.
            </div>
          )}
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
