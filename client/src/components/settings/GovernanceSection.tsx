import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { IntakeWorkflowSection } from "./IntakeWorkflowSection";
import { IntakeFormLayoutSection } from "./IntakeFormLayoutSection";
import { ProjectFormLayoutSection } from "./ProjectFormLayoutSection";
import { ProjectWorkflowSection } from "./ProjectWorkflowSection";
import { GitBranch, FolderKanban, Layout, LayoutGrid, BarChart3 } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function PowerBiIntakeToggleCard() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const checked = currentOrganization?.showPowerBiIntake ?? true;

  const handleToggle = async (next: boolean) => {
    if (!currentOrganization) return;
    try {
      await apiRequest("PUT", `/api/organizations/${currentOrganization.id}`, {
        showPowerBiIntake: next,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      await queryClient.invalidateQueries({ queryKey: [`/api/users`] });
      toast({
        title: "Saved",
        description: next
          ? "Power BI Requests tab is now visible on the Intake page."
          : "Power BI Requests tab is now hidden from the Intake page.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to update setting",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Power BI Requests tab
        </CardTitle>
        <CardDescription>
          Show or hide the Power BI Requests tab on the Project Intakes page.
          The Power BI Agent itself stays available from the sidebar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="show-powerbi-intake" className="text-sm">
            Show Power BI Requests tab on the Intake page
          </Label>
          <Switch
            id="show-powerbi-intake"
            checked={checked}
            onCheckedChange={handleToggle}
            data-testid="switch-show-powerbi-intake"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function GovernanceSection({ organizationId }: { organizationId: number }) {
  const [activeTab, setActiveTab] = useState("intake");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Governance</h2>
        <p className="text-muted-foreground">
          Configure intake workflows and project governance policies for your organization.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="intake" className="gap-2">
            <GitBranch className="h-4 w-4" />
            Intake
          </TabsTrigger>
          <TabsTrigger value="intake-form" className="gap-2" data-testid="tab-intake-form-layout">
            <Layout className="h-4 w-4" />
            Intake Form
          </TabsTrigger>
          <TabsTrigger value="project" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Project
          </TabsTrigger>
          <TabsTrigger value="project-form" className="gap-2" data-testid="tab-project-form-layout">
            <LayoutGrid className="h-4 w-4" />
            Project Form
          </TabsTrigger>
        </TabsList>

        <TabsContent value="intake" className="mt-4 space-y-6">
          <PowerBiIntakeToggleCard />
          <IntakeWorkflowSection organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="intake-form" className="mt-4">
          <IntakeFormLayoutSection organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="project" className="mt-4">
          <ProjectWorkflowSection organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="project-form" className="mt-4">
          <ProjectFormLayoutSection organizationId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
