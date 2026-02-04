import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, Sparkles, ArrowRight } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import logoIcon from "@assets/FridayReportAI_logo_F-symbol_1770231051194.png";
import { Footer } from "@/components/layout/Footer";

type VerifyState = "loading" | "success" | "show_demo_dialog" | "error" | "user-exists";

export default function VerifyMagicLinkPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [state, setState] = useState<VerifyState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [userOrg, setUserOrg] = useState<{ id: number; name: string } | null>(null);
  const [customIndustry, setCustomIndustry] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("");

  const token = new URLSearchParams(search).get("token") || "";

  const { data: industries, isLoading: industriesLoading } = useQuery<Array<{ id: string; label: string; description: string }>>({
    queryKey: ['/api/demo-data/industries'],
    enabled: state === "show_demo_dialog",
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { organizationId: number; industry?: string; customIndustry?: string }) => {
      return apiRequest('POST', '/api/demo-data/generate', data);
    },
    onSuccess: async (response: any) => {
      // Invalidate all relevant queries to ensure dashboard shows fresh data
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

      // Wait for user data to be fully loaded before redirecting
      const userData = await queryClient.fetchQuery({
        queryKey: ["/api/auth/user"],
        queryFn: async () => {
          const res = await fetch("/api/auth/user", { credentials: "include" });
          if (!res.ok) return null;
          return res.json();
        },
        staleTime: 0,
      });

      // Load organizations and memberships
      if (userData?.id) {
        await Promise.all([
          queryClient.fetchQuery({
            queryKey: ["/api/organizations"],
            staleTime: 0,
          }),
          queryClient.fetchQuery({
            queryKey: ['/api/users', userData.id, 'organizations'],
            queryFn: async () => {
              const res = await fetch(`/api/users/${userData.id}/organizations`);
              return res.json();
            },
            staleTime: 0,
          }),
        ]);
      }

      toast({
        title: "Demo Data Generated",
        description: `Created ${response.stats?.portfolios || 0} portfolios, ${response.stats?.projects || 0} projects`,
      });
      
      // Small delay to ensure React Query cache is fully propagated
      setTimeout(() => setLocation("/"), 100);
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
    if (!userOrg) return;
    if (customIndustry.trim()) {
      generateMutation.mutate({ organizationId: userOrg.id, customIndustry: customIndustry.trim() });
    } else if (selectedIndustry) {
      generateMutation.mutate({ organizationId: userOrg.id, industry: selectedIndustry });
    }
  };

  const handleSkip = async () => {
    // Fetch user data first to get the user ID
    const userData = await queryClient.fetchQuery({
      queryKey: ["/api/auth/user"],
      queryFn: async () => {
        const res = await fetch("/api/auth/user", { credentials: "include" });
        if (!res.ok) return null;
        return res.json();
      },
      staleTime: 0,
    });

    // Load organizations and memberships before redirecting
    if (userData?.id) {
      await Promise.all([
        queryClient.fetchQuery({
          queryKey: ["/api/organizations"],
          staleTime: 0,
        }),
        queryClient.fetchQuery({
          queryKey: ['/api/users', userData.id, 'organizations'],
          queryFn: async () => {
            const res = await fetch(`/api/users/${userData.id}/organizations`);
            return res.json();
          },
          staleTime: 0,
        }),
      ]);
    }
    
    // Small delay to ensure React Query cache is fully propagated
    setTimeout(() => setLocation("/"), 100);
  };

  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorMessage("Invalid verification link");
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`/api/auth/magic-link/verify?token=${token}`, {
          credentials: "include",
        });
        const result = await res.json();

        if (!res.ok) {
          if (result.userExists) {
            setState("user-exists");
          } else if (result.expired) {
            setState("error");
            setErrorMessage("This link has expired. Please request a new one.");
          } else {
            setState("error");
            setErrorMessage(result.message || "Verification failed");
          }
          return;
        }

        // Ensure all relevant queries are invalidated before refetching
        // This is critical for new users who just had their organization created
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/organizations"] }),
          // Also invalidate user-specific organization queries (used by Profile page)
          queryClient.invalidateQueries({ predicate: (query) => 
            Array.isArray(query.queryKey) && 
            query.queryKey[0] === '/api/users' && 
            query.queryKey[2] === 'organizations'
          }),
        ]);
        
        // Wait for user auth to be fully loaded with actual data
        const userData = await queryClient.fetchQuery({
          queryKey: ["/api/auth/user"],
          queryFn: async () => {
            const res = await fetch("/api/auth/user", { credentials: "include" });
            if (!res.ok) return null;
            return res.json();
          },
          staleTime: 0,
        });

        // If we have user data, also load their organizations and memberships
        if (userData?.id) {
          await Promise.all([
            queryClient.fetchQuery({
              queryKey: ["/api/organizations"],
              staleTime: 0,
            }),
            queryClient.fetchQuery({
              queryKey: ['/api/users', userData.id, 'organizations'],
              queryFn: async () => {
                const res = await fetch(`/api/users/${userData.id}/organizations`);
                return res.json();
              },
              staleTime: 0,
            }),
          ]);
        }

        // Check if a new organization was created - use org details from response
        // This applies to both regular signups and resource invite signups
        if (result.organizationCreated && result.organizationId && result.organizationName) {
          // Store the organization ID in localStorage so OrganizationProvider selects it immediately
          localStorage.setItem('currentOrgId', String(result.organizationId));
          
          // For external share invites, skip demo dialog and go directly to success
          // since the user is joining as a collaborator, not setting up their own workspace
          if (result.isExternalShare) {
            setState("success");
            // Small delay to ensure React Query cache is fully propagated
            setTimeout(() => setLocation("/"), 100);
            return;
          }
          
          setUserOrg({ id: result.organizationId, name: result.organizationName });
          setState("show_demo_dialog");
          return;
        }

        // Default: show success and redirect
        setState("success");
        // Small delay to ensure React Query cache is fully propagated
        setTimeout(() => setLocation("/"), 100);
      } catch (error) {
        setState("error");
        setErrorMessage("An error occurred while verifying your link");
      }
    };

    verifyToken();
  }, [token, setLocation]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 p-4">
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={logoIcon} alt="FridayReport.AI" className="h-16 w-16" />
            </div>
            <CardTitle className="text-2xl font-display">
              {state === "loading" && "Verifying..."}
              {state === "success" && "Welcome!"}
              {state === "show_demo_dialog" && "Welcome to FridayReport!"}
              {state === "error" && "Verification Failed"}
              {state === "user-exists" && "Account Exists"}
            </CardTitle>
            <CardDescription>
              {state === "loading" && "Please wait while we verify your email"}
              {state === "success" && "Your account has been created successfully"}
              {state === "show_demo_dialog" && userOrg && `Your organization "${userOrg.name}" has been created`}
              {state === "error" && errorMessage}
              {state === "user-exists" && "An account with this email already exists"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            {state === "loading" && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            )}

            {state === "success" && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Redirecting you to the dashboard...
                </p>
              </div>
            )}

            {state === "show_demo_dialog" && userOrg && (
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
                        data-testid="input-demo-industry"
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
                      <SelectTrigger data-testid="select-demo-industry">
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
                    data-testid="button-generate-demo-data"
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
                  data-testid="button-skip-demo"
                >
                  Skip for now
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}

            {state === "error" && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                  </div>
                </div>
                <Button
                  onClick={() => setLocation("/auth")}
                  className="w-full"
                  data-testid="button-back-to-auth"
                >
                  Back to Sign Up
                </Button>
              </div>
            )}

            {state === "user-exists" && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="h-16 w-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Please log in with your existing account.
                </p>
                <Button
                  onClick={() => setLocation("/auth")}
                  className="w-full"
                  data-testid="button-go-to-login"
                >
                  Go to Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
