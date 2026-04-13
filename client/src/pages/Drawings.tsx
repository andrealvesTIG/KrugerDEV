import { useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { useDrawings } from "@/hooks/use-drawings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PenSquare, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

function getStatusColor(status: string) {
  switch (status) {
    case "Current": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "Superseded": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "Void": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "";
  }
}

function getDisciplineColor(discipline: string) {
  const colors: Record<string, string> = {
    "Architectural": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "Structural": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    "Mechanical": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    "Electrical": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    "Plumbing": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    "Civil": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };
  return colors[discipline] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

export default function Drawings() {
  const { currentOrganization } = useOrganization();
  const { data: projects, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>();

  const activeProjectId = selectedProjectId || projects?.[0]?.id;
  const { data: drawings = [], isLoading: drawingsLoading } = useDrawings(activeProjectId);

  const isLoading = projectsLoading || drawingsLoading;

  const grouped = drawings.reduce<Record<string, typeof drawings>>((acc, d) => {
    const disc = d.discipline || "General";
    if (!acc[disc]) acc[disc] = [];
    acc[disc].push(d);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PenSquare className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Drawings</h1>
        </div>
        <Select
          value={activeProjectId?.toString() || ""}
          onValueChange={(v) => setSelectedProjectId(Number(v))}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {projects?.map(p => (
              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : drawings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <PenSquare className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="font-medium text-lg">No drawings</h3>
            <p className="text-sm text-muted-foreground">
              {activeProjectId
                ? "No drawings found for this project. Open the project to add drawings."
                : "Select a project to view drawings."}
            </p>
            {activeProjectId && (
              <Link href={`/projects/${activeProjectId}?tab=drawings`} className="mt-3 text-sm text-primary flex items-center gap-1">
                Open Project <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{drawings.length} drawing{drawings.length !== 1 ? "s" : ""}</p>
            {activeProjectId && (
              <Link href={`/projects/${activeProjectId}?tab=drawings`} className="text-sm text-primary flex items-center gap-1">
                Open in Project <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>

          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([discipline, items]) => (
            <Card key={discipline}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge className={cn("font-medium", getDisciplineColor(discipline))}>{discipline}</Badge>
                  <span className="text-muted-foreground font-normal">({items.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {items.map(drawing => (
                    <div key={drawing.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-medium w-20">{drawing.drawingNumber}</span>
                        <span className="text-sm">{drawing.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getStatusColor(drawing.status)}>
                          {drawing.status}
                        </Badge>
                        {drawing.currentRevisionNumber ? (
                          <span className="text-xs text-muted-foreground">Rev {drawing.currentRevisionNumber}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
