import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertCircle, Rocket, FolderOpen, Search, RefreshCw, ExternalLink, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface PlannerPremiumBulkImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  portfolios: { id: number; name: string }[];
}

interface DataversePlan {
  id: string;
  title: string;
  createdDateTime: string;
  modifiedDateTime: string;
  owner: string;
  isPremium: boolean;
}

interface DataverseStatus {
  connected: boolean;
  environmentUrl?: string;
}

interface ImportProgress {
  planId: string;
  planName: string;
  status: 'pending' | 'importing' | 'success' | 'error';
  message?: string;
  projectId?: number;
  taskCount?: number;
}

type WizardStep = "connect" | "select" | "importing" | "complete";

export function PlannerPremiumBulkImportWizard({ 
  open, 
  onOpenChange, 
  organizationId,
  portfolios 
}: PlannerPremiumBulkImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("connect");
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [targetPortfolioId, setTargetPortfolioId] = useState<string>("none");
  const [environmentUrl, setEnvironmentUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [importProgress, setImportProgress] = useState<ImportProgress[]>([]);
  const { toast } = useToast();

  const { data: status, refetch: refetchStatus } = useQuery<DataverseStatus>({
    queryKey: ["/api/dataverse/status"],
    enabled: open,
  });

  const { data: plansData, isLoading: loadingPlans, refetch: refetchPlans, error: plansError, isError: plansIsError } = useQuery<{ plans: DataversePlan[] }>({
    queryKey: ["/api/dataverse/plans"],
    enabled: open && status?.connected && step === "select",
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/dataverse/plans");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.message || `Error ${response.status}`);
        (error as any).status = response.status;
        throw error;
      }
      return response.json();
    },
  });

  useEffect(() => {
    if (status?.environmentUrl && !environmentUrl) {
      setEnvironmentUrl(status.environmentUrl);
    }
  }, [status?.environmentUrl, environmentUrl]);

  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (plansIsError && plansError) {
      const error = plansError as any;
      if (error?.status === 401 || error?.message?.includes('Session expired') || error?.message?.includes('Not connected')) {
        setSessionExpired(true);
        setStep("connect");
        toast({
          title: "Session Expired",
          description: "Your session has expired. Please reconnect to Dataverse.",
          variant: "destructive",
        });
      }
    }
  }, [plansIsError, plansError, toast]);

  useEffect(() => {
    if (open && step === "connect" && !sessionExpired) {
      refetchStatus();
    }
  }, [open, step, sessionExpired, refetchStatus]);

  useEffect(() => {
    if (open && step === "connect" && status?.connected && !sessionExpired) {
      setStep("select");
      setSelectedPlans([]);
    }
  }, [open, step, status?.connected, sessionExpired]);

  useEffect(() => {
    if (!open && step !== "importing" && step !== "complete") {
      setSelectedPlans([]);
      setTargetPortfolioId("none");
      setSearchQuery("");
      setImportProgress([]);
    }
  }, [open]);

  const connectMutation = useMutation({
    mutationFn: async (envUrl: string) => {
      await apiRequest("POST", "/api/dataverse/set-environment", { environmentUrl: envUrl });
      const response = await apiRequest("POST", "/api/dataverse/connect", {});
      return response.json();
    },
    onSuccess: (data: any) => {
      setSessionExpired(false);
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
      const response = await apiRequest("POST", "/api/dataverse/disconnect", {});
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    },
    onSuccess: () => {
      refetchStatus();
      setStep("connect");
      setSelectedPlans([]);
      toast({ title: "Disconnected", description: "Disconnected from Dataverse" });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async ({ planIds, portfolioId }: { planIds: string[]; portfolioId?: number }) => {
      const results: ImportProgress[] = [];
      
      for (const planId of planIds) {
        const plan = plansData?.plans.find(p => p.id === planId);
        const progressItem: ImportProgress = {
          planId,
          planName: plan?.title || planId,
          status: 'importing',
        };
        
        setImportProgress(prev => {
          const existing = prev.filter(p => p.planId !== planId);
          return [...existing, progressItem];
        });
        
        try {
          const response = await apiRequest("POST", "/api/dataverse/import", {
            planId,
            organizationId,
            portfolioId,
          });
          const result = await response.json();
          
          progressItem.status = 'success';
          progressItem.projectId = result.projectId;
          progressItem.taskCount = result.taskCount;
          progressItem.message = `Imported ${result.taskCount} tasks`;
        } catch (error: any) {
          progressItem.status = 'error';
          progressItem.message = error.message || 'Import failed';
        }
        
        results.push(progressItem);
        setImportProgress(prev => {
          const existing = prev.filter(p => p.planId !== planId);
          return [...existing, progressItem];
        });
      }
      
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;
      
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      
      setStep("complete");
      
      if (successCount > 0) {
        toast({ 
          title: "Import Complete", 
          description: `${successCount} project(s) imported${errorCount > 0 ? `, ${errorCount} failed` : ''}` 
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleStartImport = () => {
    if (selectedPlans.length === 0) return;
    
    setStep("importing");
    const initialProgress = selectedPlans.map(planId => ({
      planId,
      planName: plansData?.plans.find(p => p.id === planId)?.title || planId,
      status: 'pending' as const,
    }));
    setImportProgress(initialProgress);
    
    bulkImportMutation.mutate({
      planIds: selectedPlans,
      portfolioId: targetPortfolioId !== "none" ? parseInt(targetPortfolioId) : undefined,
    });
  };

  const togglePlanSelection = (planId: string) => {
    setSelectedPlans(prev => 
      prev.includes(planId) 
        ? prev.filter(id => id !== planId) 
        : [...prev, planId]
    );
  };

  const selectAll = () => {
    const filteredPlans = plansData?.plans.filter(p => 
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];
    setSelectedPlans(filteredPlans.map(p => p.id));
  };

  const deselectAll = () => {
    setSelectedPlans([]);
  };

  const filteredPlans = plansData?.plans.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const completedCount = importProgress.filter(p => p.status === 'success').length;
  const errorCount = importProgress.filter(p => p.status === 'error').length;
  const progressPercent = importProgress.length > 0 
    ? ((completedCount + errorCount) / importProgress.length) * 100 
    : 0;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && step === "importing") {
      toast({
        title: "Import in Progress",
        description: "Please wait for the import to complete before closing.",
        variant: "destructive",
      });
      return;
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-purple-500" />
            Planner Premium Bulk Import
          </DialogTitle>
          <DialogDescription>
            {step === "connect" && "Connect to your Dataverse environment to import plans"}
            {step === "select" && "Select plans to import as projects"}
            {step === "importing" && "Importing plans..."}
            {step === "complete" && "Import complete"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden py-4">
          {step === "connect" && (
            <div className="space-y-4">
              {sessionExpired ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <AlertCircle className="h-16 w-16 text-yellow-500" />
                  <p className="text-lg font-medium">Session Expired</p>
                  <p className="text-sm text-muted-foreground text-center">
                    Your Dataverse session has expired. Please reconnect to continue.
                  </p>
                  <div className="w-full max-w-md space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="env-url-reconnect">Dataverse Environment URL</Label>
                      <Input
                        id="env-url-reconnect"
                        placeholder="https://your-org.crm.dynamics.com"
                        value={environmentUrl}
                        onChange={(e) => setEnvironmentUrl(e.target.value)}
                        data-testid="input-dataverse-url-reconnect"
                      />
                    </div>
                    <Button 
                      onClick={() => connectMutation.mutate(environmentUrl)}
                      disabled={!environmentUrl || connectMutation.isPending}
                      className="w-full"
                      data-testid="button-reconnect-dataverse"
                    >
                      {connectMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="mr-2 h-4 w-4" />
                      )}
                      Reconnect with Microsoft
                    </Button>
                  </div>
                </div>
              ) : status?.connected ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <CheckCircle2 className="h-16 w-16 text-green-500" />
                  <p className="text-lg font-medium">Connected to Dataverse</p>
                  {status.environmentUrl && (
                    <p className="text-sm text-muted-foreground">{status.environmentUrl}</p>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={() => { setStep("select"); refetchPlans(); }}>
                      Continue to Plan Selection
                    </Button>
                    <Button variant="outline" onClick={() => disconnectMutation.mutate()}>
                      Disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="env-url">Dataverse Environment URL</Label>
                    <Input
                      id="env-url"
                      placeholder="https://your-org.crm.dynamics.com"
                      value={environmentUrl}
                      onChange={(e) => setEnvironmentUrl(e.target.value)}
                      data-testid="input-dataverse-url"
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter your Dataverse/Dynamics 365 environment URL. This is typically your organization's CRM URL.
                    </p>
                  </div>
                  <Button 
                    onClick={() => connectMutation.mutate(environmentUrl)}
                    disabled={!environmentUrl || connectMutation.isPending}
                    className="w-full"
                    data-testid="button-connect-dataverse"
                  >
                    {connectMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="mr-2 h-4 w-4" />
                    )}
                    Connect with Microsoft
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "select" && (
            <div className="flex flex-col h-full space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search plans..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-plans"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={() => refetchPlans()}>
                  <RefreshCw className={`h-4 w-4 ${loadingPlans ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {selectedPlans.length} of {filteredPlans.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll} className="h-auto px-1 text-primary hover:text-primary">
                    Select All
                  </Button>
                  <span className="text-muted-foreground">|</span>
                  <Button variant="ghost" size="sm" onClick={deselectAll} className="h-auto px-1 text-primary hover:text-primary">
                    Deselect All
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 border rounded-md">
                {loadingPlans ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredPlans.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FolderOpen className="h-12 w-12 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No plans found</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredPlans.map((plan) => (
                      <div
                        key={plan.id}
                        className={`flex items-center gap-3 p-3 rounded-md hover-elevate cursor-pointer ${
                          selectedPlans.includes(plan.id) ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => togglePlanSelection(plan.id)}
                        data-testid={`plan-item-${plan.id}`}
                      >
                        <Checkbox
                          checked={selectedPlans.includes(plan.id)}
                          onCheckedChange={() => togglePlanSelection(plan.id)}
                          data-testid={`checkbox-plan-${plan.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{plan.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Modified {format(new Date(plan.modifiedDateTime), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <Badge variant="default" className="shrink-0">
                          Active
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="space-y-2">
                <Label>Target Portfolio (Optional)</Label>
                <Select value={targetPortfolioId} onValueChange={setTargetPortfolioId}>
                  <SelectTrigger data-testid="select-portfolio">
                    <SelectValue placeholder="Select a portfolio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Portfolio</SelectItem>
                    {portfolios.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Importing {completedCount + errorCount} of {importProgress.length} plans</span>
                  <span>{Math.round(progressPercent)}%</span>
                </div>
                <Progress value={progressPercent} />
              </div>

              <ScrollArea className="h-[300px] border rounded-md p-2">
                <div className="space-y-2">
                  {importProgress.map((item) => (
                    <div
                      key={item.planId}
                      className="flex items-center gap-3 p-3 rounded-md bg-muted/30"
                      data-testid={`import-status-${item.planId}`}
                    >
                      {item.status === 'pending' && (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                      )}
                      {item.status === 'importing' && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {item.status === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {item.status === 'error' && (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.planName}</p>
                        {item.message && (
                          <p className="text-xs text-muted-foreground">{item.message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {step === "complete" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <p className="text-lg font-medium">Import Complete</p>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>{completedCount} imported</span>
                </div>
                {errorCount > 0 && (
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span>{errorCount} failed</span>
                  </div>
                )}
              </div>
              
              <ScrollArea className="w-full max-h-[200px] border rounded-md p-2">
                <div className="space-y-1">
                  {importProgress.map((item) => (
                    <div
                      key={item.planId}
                      className="flex items-center gap-2 p-2 rounded-md text-sm"
                    >
                      {item.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="flex-1 truncate">{item.planName}</span>
                      {item.taskCount !== undefined && (
                        <Badge variant="secondary">{item.taskCount} tasks</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "connect" && !status?.connected && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          
          {step === "select" && (
            <>
              <Button variant="outline" onClick={() => disconnectMutation.mutate()}>
                Disconnect
              </Button>
              <Button 
                onClick={handleStartImport}
                disabled={selectedPlans.length === 0}
                data-testid="button-start-import"
              >
                Import {selectedPlans.length} Plan{selectedPlans.length !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          
          {step === "importing" && (
            <Button variant="outline" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </Button>
          )}
          
          {step === "complete" && (
            <>
              <Button 
                variant="outline" 
                onClick={() => {
                  setStep("select");
                  setSelectedPlans([]);
                  setImportProgress([]);
                  refetchPlans();
                }}
                data-testid="button-start-another"
              >
                Start Another Import
              </Button>
              <Button onClick={() => onOpenChange(false)} data-testid="button-close">
                Close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
