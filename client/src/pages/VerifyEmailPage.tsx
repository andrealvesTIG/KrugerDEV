import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link");
      return;
    }

    async function verifyEmail() {
      try {
        const response = await fetch(`/api/auth/verify-email?token=${token}`, {
          credentials: "include",
        });

        const data = await response.json();

        if (data.valid && data.success) {
          setStatus("success");
          setMessage("Your email has been verified successfully!");
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        } else if (data.expired) {
          setStatus("expired");
          setMessage("This verification link has expired. Please request a new one.");
        } else {
          setStatus("error");
          setMessage(data.message || "Invalid or expired verification link");
        }
      } catch {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      }
    }

    verifyEmail();
  }, [queryClient]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === "loading" && (
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            {status === "success" && (
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            )}
            {(status === "error" || status === "expired") && (
              <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
            )}
          </div>
          <CardTitle>
            {status === "loading" && "Verifying Email..."}
            {status === "success" && "Email Verified!"}
            {status === "error" && "Verification Failed"}
            {status === "expired" && "Link Expired"}
          </CardTitle>
          <CardDescription className="mt-2">
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          {status === "loading" ? (
            <p className="text-sm text-muted-foreground">Please wait while we verify your email address...</p>
          ) : (
            <Button 
              onClick={() => setLocation("/")}
              data-testid="button-go-to-dashboard"
            >
              Go to Dashboard
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
