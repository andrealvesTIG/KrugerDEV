import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import logoIcon from "@assets/icon_orange_bright@16x_1767637282986.png";
import { Footer } from "@/components/layout/Footer";
import { TurnstileWidget, type TurnstileWidgetRef } from "@/components/TurnstileWidget";

type AuthMode = "login" | "register" | "forgot-password" | "magic-link";

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);

  const { data: microsoftStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/auth/microsoft/status"],
  });

  useEffect(() => {
    const params = new URLSearchParams(search);
    const error = params.get("error");
    if (error) {
      toast({ title: "Authentication Error", description: error, variant: "destructive" });
      window.history.replaceState({}, "", "/auth");
    }
    
    const ref = params.get("ref");
    if (ref) {
      setReferralCode(ref);
      setMode("register");
    }
  }, [search, toast]);

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; turnstileToken: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({ title: "Login Failed", description: error.message, variant: "destructive" });
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string; referralCode?: string; turnstileToken: string }) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Registration failed");
      }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: { email: string; turnstileToken: string }) => {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Check Your Email", description: data.message });
      setMode("login");
      setEmail("");
    },
    onError: (error: Error) => {
      toast({ title: "Request Failed", description: error.message, variant: "destructive" });
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    },
  });

  const magicLinkMutation = useMutation({
    mutationFn: async (data: { email: string; turnstileToken: string }) => {
      const res = await fetch("/api/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        if (result.userExists) {
          throw new Error("EXISTS:" + result.message);
        }
        throw new Error(result.message || "Request failed");
      }
      return result;
    },
    onSuccess: () => {
      setMagicLinkSent(true);
    },
    onError: (error: Error) => {
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      if (error.message.startsWith("EXISTS:")) {
        toast({ 
          title: "Account Exists", 
          description: "An account with this email already exists. Please log in instead.",
          variant: "default" 
        });
        setMode("login");
        setEmail(magicLinkEmail);
      } else {
        toast({ title: "Request Failed", description: error.message, variant: "destructive" });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!turnstileToken) {
      toast({
        title: "Verification Required",
        description: "Please complete the security check",
        variant: "destructive",
      });
      return;
    }

    if (mode === "login") {
      loginMutation.mutate({ email, password, turnstileToken });
    } else if (mode === "register") {
      registerMutation.mutate({ email, password, firstName: firstName || undefined, lastName: lastName || undefined, referralCode: referralCode || undefined, turnstileToken });
    } else if (mode === "forgot-password") {
      forgotPasswordMutation.mutate({ email, turnstileToken });
    } else if (mode === "magic-link") {
      magicLinkMutation.mutate({ email: magicLinkEmail, turnstileToken });
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending || forgotPasswordMutation.isPending || magicLinkMutation.isPending;

  const getTitle = () => {
    switch (mode) {
      case "login": return "Welcome Back";
      case "register": return "Create Account";
      case "forgot-password": return "Reset Password";
      case "magic-link": return magicLinkSent ? "Check Your Email" : "Sign Up with Email";
    }
  };

  const getDescription = () => {
    switch (mode) {
      case "login": return "Sign in to your FridayReport.AI account";
      case "register": return "Get started with FridayReport.AI";
      case "forgot-password": return "Enter your email to receive a password reset link";
      case "magic-link": return magicLinkSent 
        ? "We've sent you a sign-up link. Click the link in your email to complete registration."
        : "Enter your email to receive a sign-up link - no password needed";
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 p-4">
      <div className="flex-1 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {(mode === "forgot-password" || mode === "magic-link") && (
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setMagicLinkSent(false);
                setMagicLinkEmail("");
              }}
              className="absolute left-4 top-4 text-muted-foreground hover:text-foreground"
              data-testid="button-back-to-login"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex justify-center mb-4">
            <img src={logoIcon} alt="FridayReport.AI" className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-display">
            {getTitle()}
          </CardTitle>
          <CardDescription>
            {getDescription()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "magic-link" && magicLinkSent ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                We sent a link to <strong>{magicLinkEmail}</strong>
              </p>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  setMagicLinkSent(false);
                  setMagicLinkEmail("");
                }}
                data-testid="button-resend-magic-link"
              >
                <Mail className="mr-2 h-4 w-4" />
                Try a different email
              </Button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && referralCode && (
              <div className="p-3 rounded-md bg-primary/10 border border-primary/20 text-center" data-testid="banner-referral">
                <p className="text-sm font-medium text-primary">
                  You were referred by a friend
                </p>
                <p className="text-xs text-muted-foreground">Code: {referralCode}</p>
              </div>
            )}
            
            {mode === "register" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    data-testid="input-last-name"
                  />
                </div>
              </div>
            )}
            {mode === "magic-link" ? (
              <div className="space-y-2">
                <Label htmlFor="magic-link-email">Email</Label>
                <Input
                  id="magic-link-email"
                  type="email"
                  value={magicLinkEmail}
                  onChange={(e) => setMagicLinkEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  data-testid="input-magic-link-email"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  data-testid="input-email"
                />
              </div>
            )}
            {(mode === "login" || mode === "register") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="password">Password</Label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot-password")}
                      className="text-sm text-muted-foreground hover:text-primary"
                      data-testid="button-forgot-password"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  minLength={6}
                  data-testid="input-password"
                />
              </div>
            )}
            <TurnstileWidget
              ref={turnstileRef}
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              className="flex justify-center"
            />
            <Button type="submit" className="w-full" disabled={isPending || !turnstileToken} data-testid="button-submit-auth">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" && "Sign In"}
              {mode === "register" && "Create Account"}
              {mode === "forgot-password" && "Send Reset Link"}
              {mode === "magic-link" && "Send Sign Up Link"}
            </Button>
          </form>
          )}

          {(mode === "login" || mode === "register") && microsoftStatus?.configured && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => window.location.href = "/api/auth/microsoft/login"}
                data-testid="button-microsoft-login"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                </svg>
                Microsoft 365
              </Button>
            </>
          )}

          {mode === "register" && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setMode("magic-link")}
                className="text-sm text-muted-foreground hover:text-primary"
                data-testid="button-passwordless-signup"
              >
                <Mail className="inline-block mr-1 h-4 w-4" />
                Sign up without password
              </button>
            </div>
          )}

          {(mode === "login" || mode === "register") && (
            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">
                {mode === "login" ? "Don't have an account?" : "Already have an account?"}
              </span>{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-primary hover:underline font-medium"
                data-testid="button-toggle-auth-mode"
              >
                {mode === "login" ? "Sign Up" : "Sign In"}
              </button>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      <Footer />
    </div>
  );
}
