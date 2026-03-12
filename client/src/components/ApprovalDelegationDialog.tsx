import { useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { useResources } from "@/hooks/use-resources";
import {
  useApprovalDelegations,
  useCreateApprovalDelegation,
  useRevokeApprovalDelegation,
  useCurrentUserResource,
} from "@/hooks/use-timesheets";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Loader2, Plus, X, Users, CalendarRange, Shield } from "lucide-react";

interface ApprovalDelegationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApprovalDelegationDialog({ open, onOpenChange }: ApprovalDelegationDialogProps) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const orgId = currentOrganization?.id ?? null;
  const { data: resources = [] } = useResources(orgId);
  const { data: delegations = [], isLoading } = useApprovalDelegations(orgId);
  const createDelegation = useCreateApprovalDelegation();
  const revokeDelegation = useRevokeApprovalDelegation();

  const [selectedDelegate, setSelectedDelegate] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const eligibleDelegates = resources.filter(r => r.userId && r.userId !== user?.id && r.isActive);

  const handleCreate = async () => {
    if (!orgId || !selectedDelegate || !startDate || !endDate) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      await createDelegation.mutateAsync({
        organizationId: orgId,
        delegateId: selectedDelegate,
        startDate,
        endDate,
      });
      toast({ title: "Delegation Created", description: "Approval authority has been delegated" });
      setSelectedDelegate("");
      setEndDate("");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to create delegation", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!orgId) return;
    try {
      await revokeDelegation.mutateAsync({ id, organizationId: orgId });
      toast({ title: "Delegation Revoked", description: "Delegation has been revoked" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to revoke delegation", variant: "destructive" });
    }
  };

  const activeDelegations = delegations.filter(d => d.isActive);
  const expiredDelegations = delegations.filter(d => !d.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Approval Delegation
          </DialogTitle>
          <DialogDescription>
            Delegate your approval authority to a team member for a date range (e.g., while you are out of office).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3 p-3 border rounded-lg">
            <Label className="text-sm font-medium">Create New Delegation</Label>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Deputy</Label>
              <Select value={selectedDelegate} onValueChange={setSelectedDelegate}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleDelegates.map(r => (
                    <SelectItem key={r.userId!} value={r.userId!}>
                      {r.displayName || r.firstName || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={isCreating || !selectedDelegate || !endDate} size="sm" className="w-full">
              {isCreating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Create Delegation
            </Button>
          </div>

          {activeDelegations.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1">
                <CalendarRange className="h-4 w-4" />
                Active Delegations
              </Label>
              {activeDelegations.map(d => (
                <Card key={d.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{d.delegatorName} → {d.delegateName}</div>
                    <div className="text-xs text-muted-foreground">{d.startDate} to {d.endDate}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className="bg-emerald-500/10 text-emerald-600 text-[10px]">Active</Badge>
                    {(d.delegatorId === user?.id) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleRevoke(d.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {expiredDelegations.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Past Delegations</Label>
              {expiredDelegations.slice(0, 5).map(d => (
                <Card key={d.id} className="p-2 opacity-60">
                  <div className="text-xs">{d.delegatorName} → {d.delegateName}</div>
                  <div className="text-xs text-muted-foreground">{d.startDate} to {d.endDate}</div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}