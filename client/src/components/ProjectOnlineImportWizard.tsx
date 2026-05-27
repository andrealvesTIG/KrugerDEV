import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink, CheckCircle2, AlertCircle, Cloud, FolderOpen, Import, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressEntry {
  projectId: string;
  name?: string;
  status: "done" | "failed";
  error?: string;
}

interface ProjectOnlineImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  portfolios: { id: number; name: string }[];
}

interface ProjectOnlineProject {
  id: string;
  name: string;
  description: string;
  startDate: string;
  finishDate: string;
  percentComplete: number;
}

interface ProjectOnlineStatus {
  configured: boolean;
  connected: boolean;
  siteUrl: string | null;
}

type WizardStep = "connect" | "select" | "importing" | "complete";

export function ProjectOnlineImportWizard({ 
  open, 
  onOpenChange, 
  organizationId,
  portfolios 
}: ProjectOnlineImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("connect");
  const [siteUrl, setSiteUrl] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [targetPortfolioId, setTargetPortfolioId] = useState<string>("none");
  const [importedCount, setImportedCount] = useState(0);
  const [failedImports, setFailedImports] = useState<{ projectId: string; error: string }[]>([]);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: status, refetch: refetchStatus } = useQuery<ProjectOnlineStatus>({
    queryKey: ["/api/project-online/status"],
    enabled: open,
  });

  const { data: projectsData, isLoading: loadingProjects, refetch: refetchProjects } = useQuery<{ projects: ProjectOnlineProject[] }>({
    queryKey: ["/api/project-online/projects"],
    enabled: open && status?.connected,
  });

  // Transition to select step when connected
  useEffect(() => {
    if (open && step === "connect" && status?.connected) {
      setStep("select");
      refetchProjects();
    }
  }, [open, step, status?.connected, refetchProjects]);

  const connectMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/project-online/connect", { siteUrl: url });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: (err: any) => {
      toast({ title: "Connection Failed", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/project-online/disconnect", {});
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    },
    onSuccess: () => {
      refetchStatus();
      setStep("connect");
      setSelectedProjects([]);
      toast({ title: "Disconnected", description: "Disconnected from Project Online" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      setProgressTotal(selectedProjects.length);
      setProgressCurrent(0);
      setProgressEntries([]);
      setCurrentProjectId(null);

      const response = await fetch("/api/project-online/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" },
        body: JSON.stringify({
          projectIds: selectedProjects,
          organizationId,
          portfolioId: targetPortfolioId !== "none" ? parseInt(targetPortfolioId) : null,
        }),
      });

      if (!response.ok || !response.body) {
        let msg = `Import failed (${response.status})`;
        try {
          const txt = await response.text();
          if (txt) msg = txt;
        } catch {}
        throw new Error(msg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let evt: any;
          try {
            evt = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (evt.type === "start") {
            setProgressTotal(evt.total || 0);
          } else if (evt.type === "progress") {
            setProgressCurrent(evt.current || 0);
            setCurrentProjectId(evt.projectId || null);
          } else if (evt.type === "project-done") {
            setProgressEntries(prev => [...prev, {
              projectId: evt.projectId,
              name: evt.name,
              status: "done",
            }]);
          } else if (evt.type === "project-failed") {
            setProgressEntries(prev => [...prev, {
              projectId: evt.projectId,
              status: "failed",
              error: evt.error,
            }]);
          } else if (evt.type === "done") {
            final = evt;
          } else if (evt.type === "error") {
            throw new Error(evt.message || "Import failed");
          }
        }
      }

      return final ?? { imported: 0, failures: [] };
    },
    onSuccess: (data: any) => {
      setImportedCount(data.imported || 0);
      setFailedImports(Array.isArray(data.failures) ? data.failures : []);
      setCurrentProjectId(null);
      setStep("complete");
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios"] });
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
      setStep("select");
    },
  });

  const handleConnect = () => {
    if (!siteUrl.trim()) {
      toast({ title: "Error", description: "Please enter your Project Online site URL", variant: "destructive" });
      return;
    }
    connectMutation.mutate(siteUrl.trim());
  };

  const handleStartImport = () => {
    if (selectedProjects.length === 0) {
      toast({ title: "Error", description: "Please select at least one project to import", variant: "destructive" });
      return;
    }
    setStep("importing");
    importMutation.mutate();
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(status?.connected ? "select" : "connect");
      setSelectedProjects([]);
      setImportedCount(0);
      setFailedImports([]);
      setProgressTotal(0);
      setProgressCurrent(0);
      setProgressEntries([]);
      setCurrentProjectId(null);
    }, 300);
  };

  const toggleProject = (projectId: string) => {
    setSelectedProjects(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const selectAll = () => {
    if (projectsData?.projects) {
      setSelectedProjects(projectsData.projects.map(p => p.id));
    }
  };

  const deselectAll = () => {
    setSelectedProjects([]);
  };

  const renderStep = () => {
    if (step === "connect" && !status?.connected) {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-center py-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Cloud className="w-8 h-8 text-primary" />
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="siteUrl">Project Online Site URL</Label>
              <Input
                id="siteUrl"
                placeholder="https://yourcompany.sharepoint.com/sites/pwa"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                data-testid="input-project-online-url"
              />
              <p className="text-xs text-muted-foreground">
                Enter the URL of your Project Web App (PWA) site. This is typically in the format: https://company.sharepoint.com/sites/pwa
              </p>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm">Requirements</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>Microsoft 365 account with Project Online access</li>
              <li>Permission to read projects in Project Web App</li>
              <li>Azure AD app registration with SharePoint permissions</li>
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button 
              onClick={handleConnect} 
              disabled={connectMutation.isPending || !siteUrl.trim()}
              data-testid="button-connect-project-online"
            >
              {connectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Connect to Microsoft
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      );
    }

    if (step === "select") {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">Connected to: {status?.siteUrl}</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              Disconnect
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Import to Portfolio (optional)</Label>
              <Select value={targetPortfolioId} onValueChange={setTargetPortfolioId}>
                <SelectTrigger data-testid="select-target-portfolio">
                  <SelectValue placeholder="Select portfolio..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No portfolio</SelectItem>
                  {portfolios.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <Label className="shrink-0">Select Projects to Import</Label>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>Deselect All</Button>
                </div>
              </div>
              
              {loadingProjects ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : projectsData?.projects && projectsData.projects.length > 0 ? (
                <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                  {projectsData.projects.map((project) => (
                    <div 
                      key={project.id}
                      className={cn(
                        "flex items-start gap-3 p-3 border-b last:border-b-0 cursor-pointer hover-elevate",
                        selectedProjects.includes(project.id) && "bg-primary/5"
                      )}
                      onClick={() => toggleProject(project.id)}
                      data-testid={`project-item-${project.id}`}
                    >
                      <Checkbox 
                        checked={selectedProjects.includes(project.id)}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggleProject(project.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm leading-tight" title={project.name}>{project.name}</p>
                        {project.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1" title={project.description}>{project.description}</p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {project.startDate && <span>Start: {new Date(project.startDate).toLocaleDateString()}</span>}
                          {project.finishDate && <span>End: {new Date(project.finishDate).toLocaleDateString()}</span>}
                          <span>{Math.round(project.percentComplete)}% complete</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mb-2" />
                  <p>No projects found in Project Online</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button 
              onClick={handleStartImport}
              disabled={selectedProjects.length === 0}
              data-testid="button-import-projects"
            >
              <Import className="mr-2 h-4 w-4" />
              Import {selectedProjects.length} Project{selectedProjects.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </div>
      );
    }

    if (step === "importing") {
      const total = progressTotal || selectedProjects.length;
      const current = progressCurrent;
      const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
      const currentProject = projectsData?.projects.find(p => p.id === currentProjectId);
      const doneCount = progressEntries.filter(e => e.status === "done").length;
      const failedCount = progressEntries.filter(e => e.status === "failed").length;
      return (
        <div className="flex flex-col py-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                Importing {current} of {total}
                {currentProject?.name ? `: ${currentProject.name}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {doneCount} done · {failedCount} failed
              </p>
            </div>
          </div>
          <Progress value={pct} data-testid="progress-import" />
          {progressEntries.length > 0 && (
            <div
              className="w-full max-h-60 overflow-y-auto rounded-md border bg-muted/30 p-3 text-xs space-y-1"
              data-testid="list-import-progress"
            >
              {[...progressEntries].reverse().map((e, i) => (
                <div key={`${e.projectId}-${i}`} className="flex items-start gap-2">
                  {e.status === "done" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{e.name || e.projectId}</p>
                    {e.error && (
                      <p className="text-destructive/80 truncate">{e.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (step === "complete") {
      const failedCount = failedImports.length;
      return (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <p className="text-lg font-medium">Import Complete</p>
          <p className="text-sm text-muted-foreground text-center">
            Successfully imported {importedCount} project{importedCount !== 1 ? "s" : ""} with their tasks and milestones.
            {failedCount > 0 && (
              <> {failedCount} project{failedCount !== 1 ? "s" : ""} could not be imported.</>
            )}
          </p>
          {failedCount > 0 && (
            <div className="w-full max-h-48 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-1" data-testid="list-failed-imports">
              <p className="font-medium text-destructive mb-1">Failed imports:</p>
              {failedImports.map((f, i) => (
                <div key={i} className="text-muted-foreground">
                  <span className="font-mono">{f.projectId}</span>: {f.error}
                </div>
              ))}
            </div>
          )}
          <Button onClick={handleClose} data-testid="button-close-wizard">
            Close
          </Button>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Import from MS Project Online
          </DialogTitle>
          <DialogDescription>
            Connect to your Microsoft Project Online account and import projects with their tasks and milestones.
          </DialogDescription>
        </DialogHeader>
        {renderStep()}
      </DialogContent>
    </Dialog>
  );
}
