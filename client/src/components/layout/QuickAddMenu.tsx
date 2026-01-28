import { useState } from "react";
import { Plus, FolderKanban, CheckSquare, AlertTriangle, Bug, FileText, FileEdit, Users, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios, useCreatePortfolio } from "@/hooks/use-portfolios";
import { useCreateProject } from "@/hooks/use-projects";
import { useCreateTask } from "@/hooks/use-tasks";
import { useCreateRisk } from "@/hooks/use-risks";
import { useCreateIssue } from "@/hooks/use-issues";
import { useCreateResource } from "@/hooks/use-resources";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type QuickAddType = "portfolio" | "project" | "task" | "risk" | "issue" | "resource" | null;

export function QuickAddMenu() {
  const [activeDialog, setActiveDialog] = useState<QuickAddType>(null);
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();

  const menuItems = [
    { type: "portfolio" as const, label: "Portfolio", icon: Briefcase },
    { type: "project" as const, label: "Project", icon: FolderKanban },
    { type: "task" as const, label: "Task", icon: CheckSquare },
    { type: "risk" as const, label: "Risk", icon: AlertTriangle },
    { type: "issue" as const, label: "Issue", icon: Bug },
    { type: "resource" as const, label: "Resource", icon: Users },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" data-testid="button-quick-add">
            <Plus className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Quick Add</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {menuItems.map((item) => (
            <DropdownMenuItem
              key={item.type}
              onClick={() => setActiveDialog(item.type)}
              data-testid={`menu-add-${item.type}`}
            >
              <item.icon className="h-4 w-4 mr-2" />
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <QuickAddPortfolioDialog
        open={activeDialog === "portfolio"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id}
      />
      <QuickAddProjectDialog
        open={activeDialog === "project"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id}
      />
      <QuickAddTaskDialog
        open={activeDialog === "task"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id}
      />
      <QuickAddRiskDialog
        open={activeDialog === "risk"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id}
      />
      <QuickAddIssueDialog
        open={activeDialog === "issue"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id}
      />
      <QuickAddResourceDialog
        open={activeDialog === "resource"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id}
      />
    </>
  );
}

function QuickAddPortfolioDialog({ open, onOpenChange, organizationId }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId?: number }) {
  const { toast } = useToast();
  const createPortfolio = useCreatePortfolio();
  const form = useForm({
    defaultValues: { name: "", description: "" },
  });

  const onSubmit = async (data: { name: string; description: string }) => {
    if (!organizationId) return;
    try {
      await createPortfolio.mutateAsync({
        organizationId,
        name: data.name,
        description: data.description || null,
        status: "Active",
        healthScore: "Green",
      });
      toast({ title: "Success", description: "Portfolio created" });
      form.reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>New Portfolio</DialogTitle>
          <DialogDescription>Create a new portfolio to group related projects.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input {...form.register("name", { required: true })} placeholder="Portfolio name" data-testid="input-portfolio-name" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea {...form.register("description")} placeholder="Optional description" data-testid="input-portfolio-description" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createPortfolio.isPending} data-testid="button-create-portfolio">
              {createPortfolio.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddProjectDialog({ open, onOpenChange, organizationId }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId?: number }) {
  const { toast } = useToast();
  const createProject = useCreateProject();
  const { data: portfolios } = usePortfolios(organizationId ?? null);
  const form = useForm({
    defaultValues: { name: "", description: "", portfolioId: null as number | null },
  });

  const onSubmit = async (data: { name: string; description: string; portfolioId: number | null }) => {
    if (!organizationId) return;
    try {
      await createProject.mutateAsync({
        organizationId,
        name: data.name,
        description: data.description || null,
        portfolioId: data.portfolioId,
        status: "Planning",
        priority: "Medium",
        health: "Green",
        source: "manual",
      });
      toast({ title: "Success", description: "Project created" });
      form.reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>Create a new project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input {...form.register("name", { required: true })} placeholder="Project name" data-testid="input-quick-project-name" />
          </div>
          <div className="space-y-2">
            <Label>Portfolio</Label>
            <Controller
              control={form.control}
              name="portfolioId"
              render={({ field }) => (
                <Select onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))} value={field.value?.toString() || "none"}>
                  <SelectTrigger data-testid="select-quick-project-portfolio">
                    <SelectValue placeholder="Select portfolio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Portfolio</SelectItem>
                    {portfolios?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea {...form.register("description")} placeholder="Optional description" data-testid="input-quick-project-description" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createProject.isPending} data-testid="button-quick-create-project">
              {createProject.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddTaskDialog({ open, onOpenChange, organizationId }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId?: number }) {
  const { toast } = useToast();
  const createTask = useCreateTask();
  const { data: projects } = useProjects(organizationId ?? null);
  const form = useForm({
    defaultValues: { name: "", projectId: null as number | null },
  });

  const onSubmit = async (data: { name: string; projectId: number | null }) => {
    if (!data.projectId) {
      toast({ title: "Error", description: "Please select a project", variant: "destructive" });
      return;
    }
    try {
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await createTask.mutateAsync({
        projectId: data.projectId,
        name: data.name,
        startDate: today,
        endDate: nextWeek,
        status: "Not Started",
        priority: "Medium",
        progress: 0,
      });
      toast({ title: "Success", description: "Task created" });
      form.reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>Add a task to a project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Controller
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                  <SelectTrigger data-testid="select-quick-task-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>Task Name</Label>
            <Input {...form.register("name", { required: true })} placeholder="Task name" data-testid="input-quick-task-name" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createTask.isPending} data-testid="button-quick-create-task">
              {createTask.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddRiskDialog({ open, onOpenChange, organizationId }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId?: number }) {
  const { toast } = useToast();
  const createRisk = useCreateRisk();
  const { data: projects } = useProjects(organizationId ?? null);
  const form = useForm({
    defaultValues: { title: "", projectId: null as number | null, probability: "Medium", impact: "Medium" },
  });

  const onSubmit = async (data: { title: string; projectId: number | null; probability: string; impact: string }) => {
    if (!data.projectId) {
      toast({ title: "Error", description: "Please select a project", variant: "destructive" });
      return;
    }
    try {
      await createRisk.mutateAsync({
        projectId: data.projectId,
        title: data.title,
        status: "Open",
        priority: "Medium",
        probability: data.probability,
        impact: data.impact,
        itemType: "risk",
      });
      toast({ title: "Success", description: "Risk created" });
      form.reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>New Risk</DialogTitle>
          <DialogDescription>Log a new risk for a project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Controller
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                  <SelectTrigger data-testid="select-quick-risk-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>Risk Title</Label>
            <Input {...form.register("title", { required: true })} placeholder="Risk title" data-testid="input-quick-risk-title" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Probability</Label>
              <Controller
                control={form.control}
                name="probability"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                control={form.control}
                name="impact"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
          <DialogFooter>
            <Button type="submit" disabled={createRisk.isPending} data-testid="button-quick-create-risk">
              {createRisk.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddIssueDialog({ open, onOpenChange, organizationId }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId?: number }) {
  const { toast } = useToast();
  const createIssue = useCreateIssue();
  const { data: projects } = useProjects(organizationId ?? null);
  const form = useForm({
    defaultValues: { title: "", projectId: null as number | null, severity: "Medium" },
  });

  const onSubmit = async (data: { title: string; projectId: number | null; severity: string }) => {
    if (!data.projectId) {
      toast({ title: "Error", description: "Please select a project", variant: "destructive" });
      return;
    }
    try {
      await createIssue.mutateAsync({
        projectId: data.projectId,
        title: data.title,
        status: "Open",
        priority: "Medium",
        severity: data.severity,
        itemType: "issue",
      });
      toast({ title: "Success", description: "Issue created" });
      form.reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>New Issue</DialogTitle>
          <DialogDescription>Log a new issue for a project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Controller
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                  <SelectTrigger data-testid="select-quick-issue-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>Issue Title</Label>
            <Input {...form.register("title", { required: true })} placeholder="Issue title" data-testid="input-quick-issue-title" />
          </div>
          <div className="space-y-2">
            <Label>Severity</Label>
            <Controller
              control={form.control}
              name="severity"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
          <DialogFooter>
            <Button type="submit" disabled={createIssue.isPending} data-testid="button-quick-create-issue">
              {createIssue.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddResourceDialog({ open, onOpenChange, organizationId }: { open: boolean; onOpenChange: (open: boolean) => void; organizationId?: number }) {
  const { toast } = useToast();
  const createResource = useCreateResource();
  const form = useForm({
    defaultValues: { displayName: "", email: "", title: "" },
  });

  const onSubmit = async (data: { displayName: string; email: string; title: string }) => {
    if (!organizationId) return;
    try {
      await createResource.mutateAsync({
        organizationId,
        displayName: data.displayName,
        email: data.email || null,
        title: data.title || null,
        isActive: true,
        isBillable: true,
        weeklyCapacity: "40",
        availability: 100,
      });
      toast({ title: "Success", description: "Resource created" });
      form.reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>New Resource</DialogTitle>
          <DialogDescription>Add a team member or resource.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input {...form.register("displayName", { required: true })} placeholder="Full name" data-testid="input-quick-resource-name" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input {...form.register("email")} type="email" placeholder="email@example.com" data-testid="input-quick-resource-email" />
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input {...form.register("title")} placeholder="Job title" data-testid="input-quick-resource-title" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createResource.isPending} data-testid="button-quick-create-resource">
              {createResource.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
