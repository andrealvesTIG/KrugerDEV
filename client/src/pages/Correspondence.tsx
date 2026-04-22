import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Mail } from "lucide-react";
import { Link } from "wouter";

export default function Correspondence() {
  const { currentOrganization } = useOrganization();
  const { data: projects, isLoading } = useProjects(currentOrganization?.id);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Correspondence</h1>
      </div>
      <p className="text-muted-foreground">Select a project to view and manage correspondence.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(projects || []).map((project: Record<string, unknown>) => (
          <Link key={project.id as number} href={`/projects/${project.id}?tab=correspondence`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <h3 className="font-semibold">{project.name as string}</h3>
                <p className="text-sm text-muted-foreground mt-1">{project.status as string}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
