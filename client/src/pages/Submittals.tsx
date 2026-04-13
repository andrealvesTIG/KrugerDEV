import { useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { useSubmittals } from "@/hooks/use-submittals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

function getStatusColor(status: string) {
  switch (status) {
    case "Pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "Under Review": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "Approved": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "Revise & Resubmit": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    default: return "";
  }
}

export default function Submittals() {
  const { currentOrganization } = useOrganization();
  const { data: projects = [], isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const { data: submittals = [], isLoading: submittalsLoading } = useSubmittals(selectedProjectId || 0);
  const activeProjects = projects.filter(p => !p.deletedAt && p.status !== "Closed");

  const statusCounts = {
    Pending: submittals.filter(s => s.status === "Pending").length,
    "Under Review": submittals.filter(s => s.status === "Under Review").length,
    Approved: submittals.filter(s => s.status === "Approved").length,
    Rejected: submittals.filter(s => s.status === "Rejected").length,
    "Revise & Resubmit": submittals.filter(s => s.status === "Revise & Resubmit").length,
  };

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Submittals</h1>
          <p className="text-muted-foreground">Track submittals and their review status across projects</p>
        </div>
        {selectedProjectId && (
          <Link href={`/projects/${selectedProjectId}?tab=submittals`}>
            <Button size="sm" variant="outline">
              <ExternalLink className="h-4 w-4 mr-1" /> View in Project
            </Button>
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-64">
          <Select
            value={selectedProjectId?.toString() || ""}
            onValueChange={(v) => setSelectedProjectId(v ? Number(v) : null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a project..." />
            </SelectTrigger>
            <SelectContent>
              {activeProjects.map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedProjectId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <RefreshCw className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Select a project to view its submittals</p>
          </CardContent>
        </Card>
      ) : submittalsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(statusCounts).map(([status, count]) => (
              <Card key={status}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">{status}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{count}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {submittals.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No submittals found for this project
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {submittals.map((sub) => (
                <Card key={sub.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className="text-xs font-mono shrink-0">{sub.submittalNumber}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{sub.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge className={cn("text-xs", getStatusColor(sub.status))}>{sub.status}</Badge>
                          {sub.type && <span className="text-xs text-muted-foreground">{sub.type}</span>}
                          {sub.specSection && <span className="text-xs text-muted-foreground">Spec: {sub.specSection}</span>}
                          <span className="text-xs text-muted-foreground">Rev {sub.currentRevision}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
