import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, ShieldAlert, Clock, RefreshCw, Mail } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Organization } from "@shared/schema";

export function NoAdminAccessView({ organization }: { organization: Organization }) {
  const { toast } = useToast();
  const [requestMessage, setRequestMessage] = useState("");
  const [showRequestDialog, setShowRequestDialog] = useState(false);

  const { data: accessStatus, isLoading: statusLoading } = useQuery<{ hasPendingRequest: boolean; request: { id: number; status: string; createdAt: string } | null }>({
    queryKey: ['/api/organizations', organization.id, 'access-requests', 'my-status'],
  });

  const submitRequestMutation = useMutation({
    mutationFn: async (message: string) => {
      return await apiRequest('POST', `/api/organizations/${organization.id}/access-requests`, { 
        message: message || undefined 
      });
    },
    onSuccess: () => {
      toast({
        title: "Request Submitted",
        description: "Your access request has been sent to the organization administrators.",
      });
      setShowRequestDialog(false);
      setRequestMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organization.id, 'access-requests', 'my-status'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Request Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resendRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      return await apiRequest('POST', `/api/organizations/${organization.id}/access-requests/${requestId}/resend`);
    },
    onSuccess: () => {
      toast({
        title: "Notification Resent",
        description: "Your access request has been resent to the organization administrators.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to resend request notification",
        variant: "destructive",
      });
    },
  });

  const hasPendingRequest = accessStatus?.hasPendingRequest;
  const pendingRequest = accessStatus?.request;

  return (
    <div className="flex h-96 flex-col items-center justify-center gap-4">
      <ShieldAlert className="h-16 w-16 text-muted-foreground/50" />
      <h2 className="text-2xl font-bold text-foreground">No Admin Access</h2>
      <p className="text-muted-foreground text-center max-w-md">
        You don't have admin access to <strong>{organization.name}</strong>. 
        Please select a different organization from the top bar or request access from an administrator.
      </p>
      
      {statusLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : hasPendingRequest ? (
        <div className="flex flex-col items-center gap-3">
          <Badge variant="secondary" className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            Request Pending
          </Badge>
          {pendingRequest?.createdAt && (
            <p className="text-xs text-muted-foreground">
              Submitted {format(new Date(pendingRequest.createdAt), 'MMM d, yyyy')}
            </p>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => pendingRequest && resendRequestMutation.mutate(pendingRequest.id)}
            disabled={resendRequestMutation.isPending}
            data-testid="button-resend-request"
          >
            {resendRequestMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resending...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Resend Request
              </>
            )}
          </Button>
        </div>
      ) : (
        <Button 
          onClick={() => setShowRequestDialog(true)}
          data-testid="button-request-access"
        >
          <Mail className="h-4 w-4 mr-2" />
          Request Access
        </Button>
      )}

      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Admin Access</DialogTitle>
            <DialogDescription>
              Send a request to the administrators of <strong>{organization.name}</strong> to grant you admin access.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="request-message">Message (optional)</Label>
              <Textarea
                id="request-message"
                placeholder="Explain why you need admin access..."
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                rows={3}
                data-testid="input-request-message"
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowRequestDialog(false)}
              data-testid="button-cancel-request"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => submitRequestMutation.mutate(requestMessage)}
              disabled={submitRequestMutation.isPending}
              data-testid="button-submit-request"
            >
              {submitRequestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
