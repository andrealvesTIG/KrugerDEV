import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Building2, Sparkles, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OnboardingStatus {
  needsOnboarding: boolean;
  detectedCompany: string | null;
  detectedIndustry: string | null;
  hasOrganization: boolean;
}

export function OnboardingDialog() {
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [createDemoData, setCreateDemoData] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const { data: status, isLoading } = useQuery<OnboardingStatus>({
    queryKey: ["/api/onboarding/status"],
    refetchOnWindowFocus: false,
  });

  if (status && !initialized && status.needsOnboarding) {
    if (status.detectedCompany && !companyName) {
      setCompanyName(status.detectedCompany);
    }
    setInitialized(true);
  }

  const completeMutation = useMutation({
    mutationFn: async (data: { companyName: string; industry: string; createDemoData: boolean }) => {
      const res = await apiRequest("POST", "/api/onboarding/complete", data);
      return res.json();
    },
    onSuccess: (data: { success: boolean; demoDataCreated: boolean }) => {
      toast({
        title: "Welcome!",
        description: data.demoDataCreated 
          ? "Your organization has been created with sample data to help you get started."
          : "Your organization has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to complete setup. Please try again.",
        variant: "destructive",
      });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/onboarding/skip");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
    },
  });

  const handleComplete = () => {
    if (!companyName.trim()) {
      toast({
        title: "Company name required",
        description: "Please enter your company name to continue.",
        variant: "destructive",
      });
      return;
    }
    completeMutation.mutate({
      companyName: companyName.trim(),
      industry: status?.detectedIndustry || "General",
      createDemoData,
    });
  };

  if (isLoading || !status?.needsOnboarding) {
    return null;
  }

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-onboarding">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-6 w-6 text-primary" />
            Welcome to Friday Report
          </DialogTitle>
          <DialogDescription className="text-base">
            Let's set up your organization to get started. We detected some information from your email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Organization Name</Label>
            <Input
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter your company name"
              data-testid="input-company-name"
            />
            {status.detectedCompany && companyName === status.detectedCompany && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Detected from your email domain
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="createDemoData" className="text-base font-medium">
                Create sample data
              </Label>
              <p className="text-sm text-muted-foreground">
                Generate sample portfolios, projects, and tasks{status.detectedIndustry && status.detectedIndustry !== "General" ? ` tailored to the ${status.detectedIndustry} industry` : ""} to help you explore the platform.
              </p>
            </div>
            <Switch
              id="createDemoData"
              checked={createDemoData}
              onCheckedChange={setCreateDemoData}
              data-testid="switch-demo-data"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => skipMutation.mutate()}
            disabled={completeMutation.isPending || skipMutation.isPending}
            data-testid="button-skip-onboarding"
          >
            Skip for now
          </Button>
          <Button
            onClick={handleComplete}
            disabled={completeMutation.isPending || skipMutation.isPending}
            data-testid="button-complete-onboarding"
          >
            {completeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              "Get Started"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
