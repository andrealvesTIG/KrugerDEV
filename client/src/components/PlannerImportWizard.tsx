import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink, CheckCircle2, AlertCircle, Calendar, FolderOpen, Import, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

interface PlannerImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  portfolios: { id: number; name: string }[];
}

interface PlannerPlan {
  id: string;
  title: string;
  createdDateTime: string;
  owner: string;
}

interface PlannerStatus {
  configured: boolean;
  connected: boolean;
}

type WizardStep = "connect" | "select" | "importing" | "complete";

export function PlannerImportWizard({ 
  open, 
  onOpenChange, 
  organizationId,
  portfolios 
}: PlannerImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("connect");
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [targetPortfolioId, setTargetPortfolioId] = useState<string>("none");
  const [importedCount, setImportedCount] = useState(0);
  const { toast } = useToast();

  const { data: status, refetch: refetchStatus } = useQuery<PlannerStatus>({
    queryKey: ["/api/planner/status"],
    enabled: open,
  });

  const { data: plansData, isLoading: loadingPlans, refetch: refetchPlans } = useQuery<{ plans: PlannerPlan[] }>({
    queryKey: ["/api/planner/plans"],
    enabled: open && status?.connected,
  });

  useEffect(() => {
    if (open && step === "connect" && status?.connected) {
      setStep("select");
      refetchPlans();
    }
  }, [open, step, status?.connected, refetchPlans]);

  useEffect(() => {
    if (!open) {
      setStep("connect");
      setSelectedPlans([]);
      setTargetPortfolioId("none");
      setImportedCount(0);
    }
  }, [open]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/planner/connect", {});
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
      const response = await apiRequest("POST", "/api/planner/disconnect", {});
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    },
    onSuccess: () => {
      refetchStatus();
      setStep("connect");
      setSelectedPlans([]);
      toast({ title: "Disconnected", description: "Disconnected from Microsoft Planner" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const planId of selectedPlans) {
        const response = await apiRequest("POST", "/api/planner/import", {
          planId,
          organizationId,
          portfolioId: targetPortfolioId !== "none" ? parseInt(targetPortfolioId) : null,
        });
        const result = await response.json();
        results.push(result);
      }
      return results;
    },
    onSuccess: (results: any[]) => {
      setImportedCount(results.length);
      setStep("complete");
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Import Complete", description: `Successfully imported ${results.length} plan(s)` });
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const togglePlan = (planId: string) => {
    setSelectedPlans(prev =>
      prev.includes(planId) ? prev.filter(p => p !== planId) : [...prev, planId]
    );
  };

  const handleConnect = () => {
    connectMutation.mutate();
  };

  const handleImport = () => {
    if (selectedPlans.length > 0) {
      setStep("importing");
      importMutation.mutate();
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (step === "complete") {
      setStep("connect");
      setSelectedPlans([]);
      setImportedCount(0);
    }
  };

  const plans = plansData?.plans || [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-600" />
            Microsoft Planner Integration
          </DialogTitle>
          <DialogDescription>
            Connect your Microsoft Planner account to import plans as projects.
          </DialogDescription>
        </DialogHeader>

        {step === "connect" && (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center gap-4 py-6">
              <div className={cn(
                "h-16 w-16 rounded-full flex items-center justify-center",
                status?.configured ? "bg-indigo-100 dark:bg-indigo-900" : "bg-muted"
              )}>
                <Calendar className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              
              {!status?.configured ? (
                <>
                  <div className="text-center space-y-2">
                    <h3 className="font-semibold">Configuration Required</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Microsoft Planner integration requires Azure AD app configuration. Please contact your administrator to set up the following environment variables:
                    </p>
                    <div className="mt-4 p-3 bg-muted rounded-lg text-left text-xs font-mono">
                      <p>MICROSOFT_CLIENT_ID</p>
                      <p>MICROSOFT_CLIENT_SECRET</p>
                      <p>MICROSOFT_TENANT_ID (optional)</p>
                    </div>
                  </div>
                </>
              ) : status?.connected ? (
                <>
                  <div className="text-center space-y-2">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-semibold">Connected</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your Microsoft Planner account is connected.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      data-testid="button-disconnect-planner"
                    >
                      {disconnectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Disconnect
                    </Button>
                    <Button 
                      onClick={() => { setStep("select"); refetchPlans(); }}
                      data-testid="button-continue-planner"
                    >
                      Continue
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center space-y-2">
                    <h3 className="font-semibold">Connect to Microsoft Planner</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Click the button below to sign in with your Microsoft account and authorize access to your Planner data.
                    </p>
                  </div>
                  <Button 
                    onClick={handleConnect}
                    disabled={connectMutation.isPending}
                    className="gap-2"
                    data-testid="button-connect-planner"
                  >
                    {connectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    Connect with Microsoft
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {step === "select" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Plans to Import</Label>
              {loadingPlans ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : plans.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p>No plans found in your Planner account.</p>
                </div>
              ) : (
                <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedPlans.includes(plan.id)}
                        onCheckedChange={() => togglePlan(plan.id)}
                        data-testid={`checkbox-plan-${plan.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{plan.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Created: {new Date(plan.createdDateTime).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {plans.length > 0 && (
              <div className="space-y-2">
                <Label>Target Portfolio (Optional)</Label>
                <Select value={targetPortfolioId} onValueChange={setTargetPortfolioId}>
                  <SelectTrigger data-testid="select-portfolio-planner">
                    <SelectValue placeholder="No portfolio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No portfolio</SelectItem>
                    {portfolios.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep("connect")} data-testid="button-back-planner">
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedPlans.length === 0}
                data-testid="button-import-planner"
              >
                <Import className="mr-2 h-4 w-4" />
                Import {selectedPlans.length > 0 && `(${selectedPlans.length})`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
            <div className="text-center">
              <h3 className="font-semibold">Importing Plans...</h3>
              <p className="text-sm text-muted-foreground">
                Please wait while we import your selected plans.
              </p>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">Import Complete!</h3>
              <p className="text-muted-foreground">
                Successfully imported {importedCount} plan{importedCount !== 1 ? "s" : ""} as project{importedCount !== 1 ? "s" : ""}.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} data-testid="button-done-planner">
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
