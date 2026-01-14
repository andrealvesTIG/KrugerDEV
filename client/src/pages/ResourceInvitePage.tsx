import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function ResourceInvitePage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const verifyToken = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        setStatus("error");
        setMessage("Invalid invitation link. Please check your email for the correct link.");
        return;
      }

      try {
        const response = await fetch(`/api/auth/resource-invite/verify?token=${token}`, {
          method: "GET",
          credentials: "include",
        });

        const data = await response.json();

        if (response.ok) {
          setStatus("success");
          setMessage(data.message || "Welcome! You've been added to the team.");
          setOrganizationName(data.organizationName);
          setIsNewUser(data.isNewUser || false);
          
          // Invalidate user-related queries to refresh auth state
          queryClient.invalidateQueries({ queryKey: ["/api/user"] });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          
          // Redirect to dashboard after a short delay
          setTimeout(() => {
            setLocation("/dashboard");
          }, 3000);
        } else {
          setStatus("error");
          setMessage(data.message || "Failed to verify invitation. The link may have expired.");
        }
      } catch (error) {
        setStatus("error");
        setMessage("An error occurred while verifying your invitation. Please try again.");
      }
    };

    verifyToken();
  }, [setLocation, queryClient]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === "loading" && (
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            )}
            {status === "success" && (
              <CheckCircle className="h-12 w-12 text-green-500" />
            )}
            {status === "error" && (
              <XCircle className="h-12 w-12 text-destructive" />
            )}
          </div>
          <CardTitle>
            {status === "loading" && "Verifying Invitation..."}
            {status === "success" && (isNewUser ? "Account Created!" : "Welcome to the Team!")}
            {status === "error" && "Invitation Error"}
          </CardTitle>
          <CardDescription className="text-base">
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === "success" && organizationName && (
            <div className="space-y-2">
              <p className="text-muted-foreground">
                You're now a member of <strong>{organizationName}</strong>
              </p>
              {isNewUser && (
                <div className="flex items-center justify-center gap-2 text-sm text-primary">
                  <UserPlus className="h-4 w-4" />
                  <span>Your account has been created and you're signed in</span>
                </div>
              )}
            </div>
          )}
          
          {status === "success" && (
            <p className="text-sm text-muted-foreground">
              Redirecting to your dashboard...
            </p>
          )}

          {status === "error" && (
            <div className="space-y-3">
              <Button
                variant="default"
                onClick={() => setLocation("/login")}
                className="w-full"
                data-testid="button-go-to-login"
              >
                Go to Login
              </Button>
              <p className="text-xs text-muted-foreground">
                If you believe this is an error, please contact the person who invited you to request a new invitation link.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
