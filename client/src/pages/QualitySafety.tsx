import { useState } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import QualitySafetyTab from "@/components/project/QualitySafetyTab";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Loader2 } from "lucide-react";

export default function QualitySafety() {
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
            <Shield className="h-6 w-6" /> Quality & Safety
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage inspections, incidents, and safety observations
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

      {selectedProjectId && currentOrganization ? (
        <QualitySafetyTab projectId={selectedProjectId} organizationId={currentOrganization.id} />
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Select a project to manage quality & safety</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
