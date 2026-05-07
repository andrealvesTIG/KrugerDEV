import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IntakeWorkflowSection } from "./IntakeWorkflowSection";
import { IntakeFormLayoutSection } from "./IntakeFormLayoutSection";
import { ProjectFormLayoutSection } from "./ProjectFormLayoutSection";
import { ProjectWorkflowSection } from "./ProjectWorkflowSection";
import { GitBranch, FolderKanban, Layout, LayoutGrid } from "lucide-react";

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

        <TabsContent value="intake" className="mt-4">
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
