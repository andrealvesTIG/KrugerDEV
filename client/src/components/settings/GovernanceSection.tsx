import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IntakeWorkflowSection } from "./IntakeWorkflowSection";
import { ProjectWorkflowSection } from "./ProjectWorkflowSection";
import { GitBranch, FolderKanban } from "lucide-react";

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
          <TabsTrigger value="project" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Project
          </TabsTrigger>
        </TabsList>

        <TabsContent value="intake" className="mt-4">
          <IntakeWorkflowSection organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="project" className="mt-4">
          <ProjectWorkflowSection organizationId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
