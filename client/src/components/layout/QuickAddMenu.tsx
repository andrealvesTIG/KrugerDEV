import { useState } from "react";
import { useLocation } from "wouter";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreatePortfolio } from "@/hooks/use-portfolios";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import { CreateRiskDialog } from "@/components/CreateRiskDialog";
import { CreateIssueDialog } from "@/components/CreateIssueDialog";
import { ResourceDialog } from "@/components/ResourceDialog";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";

type QuickAddType = "portfolio" | "project" | "task" | "risk" | "issue" | "resource" | null;

export function QuickAddMenu() {
  const [activeDialog, setActiveDialog] = useState<QuickAddType>(null);
  const { currentOrganization } = useOrganization();
  const [, navigate] = useLocation();
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
        onProjectCreated={(projectId) => navigate(`/projects/${projectId}`)}
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
      <CreateIssueDialog
        open={activeDialog === "issue"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id ?? null}
      />
      <ResourceDialog
        open={activeDialog === "resource"}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        organizationId={currentOrganization?.id}
        onSuccess={() => setActiveDialog(null)}
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

