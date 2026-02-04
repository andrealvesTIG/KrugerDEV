import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import logoIcon from "@assets/FridayReportAI_logo_F-symbol_1770231051194.png";
import { Footer } from "@/components/layout/Footer";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [customIndustry, setCustomIndustry] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("");

  const params = new URLSearchParams(search);
  const orgId = params.get("orgId");
  const orgName = params.get("orgName") || "Your Organization";

  useEffect(() => {
    if (!orgId) {
      setLocation("/");
    }
  }, [orgId, setLocation]);

  const { data: industries, isLoading: industriesLoading } = useQuery<Array<{ id: string; label: string; description: string }>>({
    queryKey: ['/api/demo-data/industries'],
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { organizationId: number; industry?: string; customIndustry?: string }) => {
      return apiRequest('POST', '/api/demo-data/generate', data);
    },
    onSuccess: async (response: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/organizations'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/risks'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/milestones'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/issues'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] }),
      ]);
      toast({
        title: "Demo Data Generated",
        description: `Created ${response.stats?.portfolios || 0} portfolios, ${response.stats?.projects || 0} projects`,
      });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate demo data",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!orgId) return;
    if (customIndustry.trim()) {
      generateMutation.mutate({ organizationId: parseInt(orgId), customIndustry: customIndustry.trim() });
    } else if (selectedIndustry) {
      generateMutation.mutate({ organizationId: parseInt(orgId), industry: selectedIndustry });
    }
  };

  const handleSkip = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] }),
    ]);
    setLocation("/");
  };

  if (!orgId) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 p-4">
      <Helmet>
        <title>Get Started - FridayReport.AI | Set Up Your Organization</title>
        <meta name="description" content="Set up your organization on FridayReport.AI. Choose your industry and get started with project portfolio management in minutes." />
        <link rel="canonical" href="https://fridayreport.ai/onboarding" />
      </Helmet>
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={logoIcon} alt="FridayReport.AI" className="h-16 w-16" />
            </div>
            <CardTitle className="text-2xl font-display">Welcome to FridayReport!</CardTitle>
            <CardDescription>
              Your organization "{decodeURIComponent(orgName)}" has been created
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="space-y-6 text-left">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              
              <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
                <div className="flex items-center gap-3 mb-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Get Started with Demo Data</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Create sample portfolios, projects, and tasks to explore the application features.
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customIndustry">Your Industry</Label>
                    <Input
                      id="customIndustry"
                      placeholder="e.g., Real Estate, Construction, Legal..."
                      value={customIndustry}
                      onChange={(e) => {
                        setCustomIndustry(e.target.value);
                        if (e.target.value) setSelectedIndustry("");
                      }}
                      data-testid="input-onboarding-industry"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1 border-t" />
                    <span className="text-xs text-muted-foreground">OR</span>
                    <div className="flex-1 border-t" />
                  </div>

                  <Select 
                    value={selectedIndustry} 
                    onValueChange={(val) => {
                      setSelectedIndustry(val);
                      if (val) setCustomIndustry("");
                    }}
                    disabled={industriesLoading}
                  >
                    <SelectTrigger data-testid="select-onboarding-industry">
                      <SelectValue placeholder={industriesLoading ? "Loading templates..." : "Choose a template"} />
                    </SelectTrigger>
                    <SelectContent>
                      {industries?.map((ind) => (
                        <SelectItem key={ind.id} value={ind.id}>
                          {ind.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending || (!customIndustry.trim() && !selectedIndustry)}
                  className="w-full mt-4"
                  data-testid="button-onboarding-generate"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Demo Data
                    </>
                  )}
                </Button>
              </div>

              <Button 
                variant="ghost" 
                onClick={handleSkip}
                className="w-full"
                data-testid="button-onboarding-skip"
              >
                Skip for now
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
