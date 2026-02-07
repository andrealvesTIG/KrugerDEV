import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Loader2, CheckCircle2, Lock, ArrowRight } from "lucide-react";
import logoIcon from "@assets/FridayReportAI_logo_F-symbol_1770231051194.png";
import { Footer } from "@/components/layout/Footer";

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function AccountSetupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupComplete, setSetupComplete] = useState(false);

  const { data: msStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/auth/microsoft/status"],
  });

  const { data: googleStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/auth/google/status"],
  });

  const setupPasswordMutation = useMutation({
    mutationFn: async (data: { password: string }) => {
      const res = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to set password");
      }
      return res.json();
    },
    onSuccess: () => {
      setSetupComplete(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Password Set",
        description: "Your password has been set up successfully. You can now sign in with your email and password.",
      });
      setTimeout(() => {
        setLocation("/");
      }, 2000);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSetPassword = (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords match.",
        variant: "destructive",
      });
      return;
    }

    setupPasswordMutation.mutate({ password });
  };

  const handleMicrosoftSignIn = () => {
    window.location.href = "/api/auth/microsoft/login";
  };

  const handleGoogleSignIn = () => {
    window.location.href = "/api/auth/google/login";
  };

  const handleSkip = () => {
    setLocation("/");
  };

  if (setupComplete) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 p-4">
        <Helmet>
          <title>Account Ready - FridayReport.AI</title>
        </Helmet>
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle>You're All Set</CardTitle>
              <CardDescription className="text-base">
                Your account is ready. Redirecting you to the app...
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 p-4">
      <Helmet>
        <title>Set Up Your Account - FridayReport.AI</title>
        <meta name="description" content="Complete your account setup on FridayReport.AI by setting a password or connecting your Microsoft or Google account." />
      </Helmet>
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={logoIcon} alt="FridayReport.AI" className="h-12 w-12" />
            </div>
            <CardTitle>Secure Your Account</CardTitle>
            <CardDescription className="text-base">
              Choose how you'd like to sign in to your account in the future. You can set a password or connect a Microsoft or Google account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(msStatus?.configured || googleStatus?.configured) && (
              <>
                <div className="space-y-3">
                  {msStatus?.configured && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleMicrosoftSignIn}
                      data-testid="button-setup-microsoft"
                    >
                      <MicrosoftIcon className="mr-2 h-4 w-4" />
                      Connect with Microsoft 365
                    </Button>
                  )}
                  {googleStatus?.configured && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleGoogleSignIn}
                      data-testid="button-setup-google"
                    >
                      <GoogleIcon className="mr-2 h-4 w-4" />
                      Connect with Google
                    </Button>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      or set a password
                    </span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  data-testid="input-setup-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  data-testid="input-setup-confirm-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full gap-2"
                disabled={setupPasswordMutation.isPending}
                data-testid="button-setup-submit-password"
              >
                {setupPasswordMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Set Password
              </Button>
            </form>

            <div className="pt-2">
              <Button
                variant="ghost"
                className="w-full gap-2 text-muted-foreground"
                onClick={handleSkip}
                data-testid="button-setup-skip"
              >
                Skip for now
                <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-2">
                You can always set up your sign-in method later from your profile settings.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
