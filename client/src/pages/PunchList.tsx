import { useState } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import PunchListTab from "@/components/project/PunchListTab";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, Loader2 } from "lucide-react";

export default function PunchList() {
  const { currentOrganization } = useOrganization();
  const { data: projects = [], isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  if (projectsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" /> Punch List
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track deficiencies and outstanding items during project close-out
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select
          value={selectedProjectId?.toString() || ""}
          onValueChange={(v) => setSelectedProjectId(v ? Number(v) : null)}
        >
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id.toString()}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedProjectId ? (
        <PunchListTab projectId={selectedProjectId} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-lg font-medium text-muted-foreground">Select a project</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a project to view and manage its punch list items.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
