import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink, CheckCircle2, AlertCircle, Cloud, FolderOpen, Import } from "lucide-react";
import { cn } from "@/lib/utils";

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
      const response = await apiRequest("POST", "/api/project-online/import", {
        projectIds: selectedProjects,
        organizationId,
        portfolioId: targetPortfolioId !== "none" ? parseInt(targetPortfolioId) : null,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      setImportedCount(data.imported || 0);
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
              <div className="flex items-center justify-between">
                <Label>Select Projects to Import</Label>
                <div className="flex gap-2">
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
                        <p className="font-medium truncate">{project.name}</p>
                        {project.description && (
                          <p className="text-sm text-muted-foreground truncate">{project.description}</p>
                        )}
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
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
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-lg font-medium">Importing Projects...</p>
          <p className="text-sm text-muted-foreground">This may take a few moments</p>
        </div>
      );
    }

    if (step === "complete") {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <p className="text-lg font-medium">Import Complete!</p>
          <p className="text-sm text-muted-foreground">
            Successfully imported {importedCount} project{importedCount !== 1 ? "s" : ""} with their tasks and milestones.
          </p>
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
      <DialogContent className="sm:max-w-[600px]">
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
