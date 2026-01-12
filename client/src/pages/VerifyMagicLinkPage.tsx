import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import logoIcon from "@assets/icon_orange_bright@16x_1767637282986.png";
import { Footer } from "@/components/layout/Footer";

type VerifyState = "loading" | "success" | "error" | "user-exists";

export default function VerifyMagicLinkPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [state, setState] = useState<VerifyState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const token = new URLSearchParams(search).get("token") || "";

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

        setState("success");
        
        // Redirect immediately, user data will be fetched on dashboard
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          setLocation("/");
        }, 1500);
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
              {state === "error" && "Verification Failed"}
              {state === "user-exists" && "Account Exists"}
            </CardTitle>
            <CardDescription>
              {state === "loading" && "Please wait while we verify your email"}
              {state === "success" && "Your account has been created successfully"}
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
