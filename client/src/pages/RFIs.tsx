import { useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { useRfis } from "@/hooks/use-rfis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageSquare, Eye, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

function getStatusColor(status: string) {
  switch (status) {
    case "Open": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "Answered": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "Closed": return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    default: return "";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "Critical": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "High": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "Medium": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "Low": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    default: return "";
  }
}

export default function RFIs() {
  const { currentOrganization } = useOrganization();
  const { data: projects = [], isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const { data: rfis = [], isLoading: rfisLoading } = useRfis(selectedProjectId || 0);
  const activeProjects = projects.filter(p => !p.deletedAt && p.status !== "Closed");

  const statusCounts = {
    Open: rfis.filter(r => r.status === "Open").length,
    Answered: rfis.filter(r => r.status === "Answered").length,
    Closed: rfis.filter(r => r.status === "Closed").length,
  };

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">RFIs</h1>
          <p className="text-muted-foreground">Manage Requests for Information across projects</p>
        </div>
        {selectedProjectId && (
          <Link href={`/projects/${selectedProjectId}?tab=rfis`}>
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
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Select a project to view its RFIs</p>
          </CardContent>
        </Card>
      ) : rfisLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Open</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-600">{statusCounts.Open}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Answered</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">{statusCounts.Answered}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Closed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-gray-600">{statusCounts.Closed}</p>
              </CardContent>
            </Card>
          </div>

          {rfis.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No RFIs found for this project
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {rfis.map((rfi) => (
                <Card key={rfi.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className="text-xs font-mono shrink-0">{rfi.rfiNumber}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{rfi.subject}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge className={cn("text-xs", getStatusColor(rfi.status))}>{rfi.status}</Badge>
                          {rfi.priority && <Badge className={cn("text-xs", getPriorityColor(rfi.priority))}>{rfi.priority}</Badge>}
                          {rfi.dueDate && <span className="text-xs text-muted-foreground">Due: {format(parseISO(rfi.dueDate), "MMM d, yyyy")}</span>}
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
