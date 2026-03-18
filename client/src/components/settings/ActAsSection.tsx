import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserCheck, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { OrganizationMember, User } from "@shared/schema";

interface EnrichedMember extends OrganizationMember {
  user?: User;
}

export function ActAsSection({ organizationId }: { organizationId: number }) {
  const { user, isActingAs, realUser } = useAuth();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const { data: members, isLoading: membersLoading } = useQuery<EnrichedMember[]>({
    queryKey: [`/api/organizations/${organizationId}/members`],
  });

  const startActingAsMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      return apiRequest("POST", `/api/organizations/${organizationId}/act-as`, { targetUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Delegate mode activated", description: "You are now viewing the app as the selected user." });
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to start delegate mode.", variant: "destructive" });
    },
  });

  const stopActingAsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/organizations/${organizationId}/act-as`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Delegate mode ended", description: "You are back to your own account." });
      window.location.reload();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to exit delegate mode.", variant: "destructive" });
    },
  });

  const currentUserId = isActingAs ? realUser?.id : user?.id;
  const selectableMembers = members?.filter(m => m.user && m.userId !== currentUserId) || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Act As User (Delegate Mode)
          </CardTitle>
          <CardDescription>
            Temporarily view the application as another user to troubleshoot permissions, verify access, or help resolve issues they are experiencing. 
            All pages, dashboards, and data will reflect the selected user's view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isActingAs && realUser ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <UserCheck className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <div className="text-sm">
                  <span className="text-amber-700 dark:text-amber-400">
                    You are currently viewing as <strong>{user?.firstName || user?.username || user?.email}</strong>.
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => stopActingAsMutation.mutate()}
                disabled={stopActingAsMutation.isPending}
                data-testid="button-stop-acting-as"
              >
                {stopActingAsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Exit Delegate Mode
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="act-as-user">Select a user to act as</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="mt-1.5" data-testid="select-act-as-user">
                    <SelectValue placeholder={membersLoading ? "Loading members..." : "Choose a team member..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableMembers.map((member) => (
                      <SelectItem key={member.userId} value={member.userId} data-testid={`option-user-${member.userId}`}>
                        <div className="flex items-center gap-2">
                          <span>{member.user?.firstName || member.user?.username || member.user?.email}</span>
                          {member.user?.lastName && <span>{member.user.lastName}</span>}
                          <span className="text-muted-foreground text-xs">({member.role})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>While in delegate mode, you will see exactly what the selected user sees. A banner will be shown at the top of every page. Any changes you make will still be logged under your admin account for audit purposes.</span>
              </div>

              <Button
                onClick={() => {
                  if (selectedUserId) {
                    startActingAsMutation.mutate(selectedUserId);
                  }
                }}
                disabled={!selectedUserId || startActingAsMutation.isPending}
                data-testid="button-start-acting-as"
              >
                {startActingAsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Start Acting As User
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
