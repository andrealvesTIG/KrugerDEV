import { AlertTriangle, Wallet, UserPlus } from "lucide-react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LimitExceededDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType?: string;
  message?: string;
  creditsNeeded?: number;
  extraSeatPriceCents?: number | null;
  onPurchaseExtraSeat?: () => void;
  isPurchasing?: boolean;
}

const resourceLabels: Record<string, string> = {
  projects: "project",
  tasks: "task",
  issues: "issue",
  risks: "risk",
  documents: "document",
  resources: "resource",
  resource_assignments: "resource assignment",
  ai_runs: "AI run",
  portfolios: "portfolio",
  intakes: "project intake",
  change_requests: "change request",
  reports: "report",
  emails: "email notification",
  shares: "project share",
  searches: "search",
  integrations: "integration",
  seats: "team member",
};

export function LimitExceededDialog({
  open,
  onOpenChange,
  resourceType,
  message,
  creditsNeeded,
  extraSeatPriceCents,
  onPurchaseExtraSeat,
  isPurchasing,
}: LimitExceededDialogProps) {
  const [, setLocation] = useLocation();

  const resourceLabel = resourceType ? resourceLabels[resourceType] || resourceType : "item";
  const isSeatsLimit = resourceType === "seats";
  const canPurchaseExtraSeat = isSeatsLimit && extraSeatPriceCents !== null && extraSeatPriceCents !== undefined && onPurchaseExtraSeat;

  const handleUpgrade = () => {
    onOpenChange(false);
    setLocation("/billing");
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const defaultMessage = isSeatsLimit
    ? canPurchaseExtraSeat
      ? `You've reached your team member limit. You can add extra seats or upgrade your plan.`
      : `You've reached your team member limit. Upgrade your plan to invite more team members.`
    : creditsNeeded 
      ? `You need ${creditsNeeded} credits to create this ${resourceLabel}, but you don't have enough remaining. Upgrade your plan to get more credits.`
      : `You've run out of credits for this billing period. Upgrade your plan to continue creating ${resourceLabel}s.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            </div>
            <DialogTitle>{isSeatsLimit ? "Team Member Limit Reached" : "Credits Limit Reached"}</DialogTitle>
          </div>
          <DialogDescription className="pt-3">
            {message || defaultMessage}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-3">
          {canPurchaseExtraSeat && (
            <div className="rounded-lg border bg-primary/5 border-primary/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserPlus className="h-4 w-4 text-primary" />
                <span>Add Extra Seat</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Add one team member seat for {formatPrice(extraSeatPriceCents)}/month. This will be added to your monthly subscription.
              </p>
              <Button 
                onClick={onPurchaseExtraSeat} 
                disabled={isPurchasing}
                className="w-full"
                data-testid="button-purchase-extra-seat"
              >
                {isPurchasing ? "Adding Seat..." : `Add Seat for ${formatPrice(extraSeatPriceCents)}/month`}
              </Button>
            </div>
          )}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="h-4 w-4 text-primary" />
              <span>{isSeatsLimit ? "Upgrade for more team seats" : "Upgrade for more credits"}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {isSeatsLimit 
                ? "Higher plans include more team member seats and additional features for your organization."
                : "Higher plans include more monthly credits and additional features. Credits reset at the start of each billing cycle."}
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-limit-dialog-close">
            Maybe Later
          </Button>
          <Button onClick={handleUpgrade} data-testid="button-limit-dialog-upgrade">
            View Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
