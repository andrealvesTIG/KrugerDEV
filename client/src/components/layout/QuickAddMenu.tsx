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
import { Checkbox } from "@/components/ui/checkbox";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios, useCreatePortfolio } from "@/hooks/use-portfolios";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import { CreateRiskDialog } from "@/components/CreateRiskDialog";
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
      <CreateProjectDialog
        open={activeDialog === "project"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id}
      />
      <CreateTaskDialog
        open={activeDialog === "task"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id ?? null}
      />
      <CreateRiskDialog
        open={activeDialog === "risk"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id ?? null}
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
    defaultValues: { name: "", description: "", strategy: "", isCustom: false },
  });

  const onSubmit = async (data: { name: string; description: string; strategy: string; isCustom: boolean }) => {
    if (!organizationId) return;
    try {
      await createPortfolio.mutateAsync({
        organizationId,
        name: data.name,
        description: data.description || null,
        strategy: data.strategy || null,
        isCustom: data.isCustom,
        status: "Active",
        healthScore: "Green",
      });
      toast({ title: "Success", description: "Portfolio created successfully" });
      form.reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Portfolio</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="qa-portfolio-name">Name</Label>
            <Input id="qa-portfolio-name" {...form.register("name", { required: "Portfolio name is required" })} placeholder="e.g. Q4 Strategic Initiatives" data-testid="input-portfolio-name" />
            {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="qa-portfolio-description">Description</Label>
            <Textarea id="qa-portfolio-description" {...form.register("description")} placeholder="Brief overview of this portfolio" data-testid="input-portfolio-description" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qa-portfolio-strategy">Strategic Alignment</Label>
            <Textarea id="qa-portfolio-strategy" {...form.register("strategy")} placeholder="How does this align with company goals?" data-testid="input-portfolio-strategy" />
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Checkbox
              id="qa-portfolio-isCustom"
              checked={form.watch("isCustom")}
              onCheckedChange={(checked) => form.setValue("isCustom", !!checked)}
              data-testid="checkbox-custom-portfolio"
            />
            <div className="space-y-0.5">
              <Label htmlFor="qa-portfolio-isCustom" className="cursor-pointer font-medium">Custom Portfolio</Label>
              <p className="text-xs text-muted-foreground">Add any project regardless of their existing portfolio assignment.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createPortfolio.isPending} data-testid="button-create-portfolio">
              {createPortfolio.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {createPortfolio.isPending ? "Creating..." : "Create Portfolio"}
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
