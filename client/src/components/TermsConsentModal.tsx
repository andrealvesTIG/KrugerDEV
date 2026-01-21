import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function TermsConsentModal() {
  const { user, isLoading: authLoading } = useAuth();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const acceptTermsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/accept-terms", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Terms Accepted",
        description: "Thank you for accepting our terms.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept terms",
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return null;
  }

  if (!user || user.termsAcceptedAt) {
    return null;
  }

  const handleAccept = () => {
    if (termsAccepted) {
      acceptTermsMutation.mutate();
    }
  };

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-[500px]" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Terms of Service & Privacy Policy</DialogTitle>
          <DialogDescription className="text-center">
            Before you continue, please review and accept our terms.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/30">
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                By using FridayReport.AI, you agree to our policies that govern how we handle your data and provide our services.
              </p>
              <div className="flex gap-4">
                <a 
                  href="/terms-of-service" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                  data-testid="link-terms-modal"
                >
                  Terms of Service
                </a>
                <a 
                  href="/privacy-statement" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                  data-testid="link-privacy-modal"
                >
                  Privacy Policy
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 pt-2">
            <Checkbox
              id="terms-consent"
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              className="mt-0.5"
              data-testid="checkbox-terms-consent"
            />
            <Label htmlFor="terms-consent" className="text-sm leading-relaxed cursor-pointer">
              I have read and agree to the{" "}
              <a 
                href="/terms-of-service" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a 
                href="/privacy-statement" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Privacy Policy
              </a>
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleAccept}
            disabled={!termsAccepted || acceptTermsMutation.isPending}
            className="w-full"
            data-testid="button-accept-terms"
          >
            {acceptTermsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Accepting...
              </>
            ) : (
              "Accept and Continue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
