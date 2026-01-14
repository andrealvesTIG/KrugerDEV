import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, X, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDismissed, setIsDismissed] = useState(false);

  const resendMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to resend verification email");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.alreadyVerified) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({
          title: "Email already verified",
          description: "Your email is already verified.",
        });
      } else {
        toast({
          title: "Verification email sent",
          description: "Please check your inbox for the verification link.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!user || user.emailVerified !== false || isDismissed) {
    return null;
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 dark:bg-amber-950/50 dark:border-amber-800" data-testid="banner-email-verification">
      <div className="mx-auto max-w-7xl px-4 py-3 md:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <span className="font-medium">Please verify your email address.</span>
              <span className="hidden sm:inline"> Check your inbox for the verification link.</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending}
              className="text-amber-700 border-amber-300 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900"
              data-testid="button-resend-verification"
            >
              {resendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Mail className="h-4 w-4 mr-1" />
              )}
              Resend
            </Button>
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1 rounded hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
              aria-label="Dismiss"
              data-testid="button-dismiss-verification-banner"
            >
              <X className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
