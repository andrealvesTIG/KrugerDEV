import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { queryClient } from "@/lib/queryClient";

type VerifyState = "verifying" | "success" | "error" | "expired" | "not_found";

export default function VerifySignInPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [state, setState] = useState<VerifyState>("verifying");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const verifyToken = async () => {
      const params = new URLSearchParams(search);
      const token = params.get("token");

      if (!token) {
        setState("error");
        setErrorMessage("No verification token provided");
        return;
      }

      try {
        const response = await fetch(`/api/auth/passwordless/verify?token=${encodeURIComponent(token)}`, {
          credentials: "include",
        });
        
        const data = await response.json();

        if (!response.ok) {
          if (data.expired) {
            setState("expired");
          } else if (data.userNotFound) {
            setState("not_found");
          } else {
            setState("error");
            setErrorMessage(data.message || "Verification failed");
          }
          return;
        }

        setState("success");
        
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
  }, [search, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        {state === "verifying" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <CardTitle className="text-2xl">Verifying...</CardTitle>
              <CardDescription>
                Please wait while we sign you in
              </CardDescription>
            </CardHeader>
          </>
        )}

        {state === "success" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl">Signed In!</CardTitle>
              <CardDescription>
                Redirecting you to your dashboard...
              </CardDescription>
            </CardHeader>
          </>
        )}

        {state === "expired" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
              </div>
              <CardTitle className="text-2xl">Link Expired</CardTitle>
              <CardDescription>
                This sign-in link has expired or has already been used
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/signin">
                <Button data-testid="button-request-new-link">
                  Request a New Link
                </Button>
              </Link>
            </CardContent>
          </>
        )}

        {state === "not_found" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
              </div>
              <CardTitle className="text-2xl">Account Not Found</CardTitle>
              <CardDescription>
                No account exists with this email. Please sign up first.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/auth?mode=signup">
                <Button data-testid="button-signup">
                  Sign Up
                </Button>
              </Link>
            </CardContent>
          </>
        )}

        {state === "error" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-2xl">Verification Failed</CardTitle>
              <CardDescription>
                {errorMessage}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-3">
              <Link href="/signin">
                <Button data-testid="button-try-again">
                  Try Again
                </Button>
              </Link>
              <p className="text-sm text-muted-foreground">
                <Link href="/auth" className="text-primary hover:underline">
                  Return to login page
                </Link>
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
