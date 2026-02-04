import { useState, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, XCircle } from "lucide-react";
import logoIcon from "@assets/FridayReportAI_logo_F-symbol_1770231051194.png";
import { Footer } from "@/components/layout/Footer";
import { TurnstileWidget, type TurnstileWidgetRef } from "@/components/TurnstileWidget";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  
  const token = new URLSearchParams(search).get("token") || "";
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);

  const { data: tokenStatus, isLoading: isVerifying } = useQuery({
    queryKey: ["/api/auth/verify-reset-token", token],
    queryFn: async () => {
      if (!token) return { valid: false };
      const res = await fetch(`/api/auth/verify-reset-token?token=${token}`);
      return res.json();
    },
    enabled: !!token,
  });

  const resetMutation = useMutation({
    mutationFn: async (data: { token: string; password: string; turnstileToken: string }) => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Reset failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password Reset", description: "Your password has been reset successfully. Please sign in." });
      setLocation("/auth");
    },
    onError: (error: Error) => {
      toast({ title: "Reset Failed", description: error.message, variant: "destructive" });
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    
    if (password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    if (!turnstileToken) {
      toast({
        title: "Verification Required",
        description: "Please complete the security check",
        variant: "destructive",
      });
      return;
    }
    
    resetMutation.mutate({ token, password, turnstileToken });
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-display">Invalid Link</CardTitle>
            <CardDescription>
              This password reset link is invalid or missing a token.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              onClick={() => setLocation("/auth")}
              data-testid="button-back-to-login"
            >
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Verifying reset link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tokenStatus && !tokenStatus.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-display">Link Expired</CardTitle>
            <CardDescription>
              This password reset link has expired or already been used. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              onClick={() => setLocation("/auth")}
              data-testid="button-back-to-login"
            >
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 p-4">
      <Helmet>
        <title>Reset Password - FridayReport.AI</title>
        <meta name="description" content="Reset your FridayReport.AI password. Secure password recovery for your project portfolio management account." />
        <link rel="canonical" href="https://fridayreport.ai/reset-password" />
      </Helmet>
      <div className="flex-1 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={logoIcon} alt="FridayReport.AI" className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-display">Set New Password</CardTitle>
          <CardDescription>
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                required
                minLength={6}
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                minLength={6}
                data-testid="input-confirm-password"
              />
            </div>
            <TurnstileWidget
              ref={turnstileRef}
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              className="flex justify-center"
            />
            <Button 
              type="submit" 
              className="w-full" 
              disabled={resetMutation.isPending || !turnstileToken}
              data-testid="button-reset-password"
            >
              {resetMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Password
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
      <Footer />
    </div>
  );
}
