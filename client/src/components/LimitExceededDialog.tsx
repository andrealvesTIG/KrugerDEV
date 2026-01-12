import { AlertTriangle, Wallet } from "lucide-react";
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
};

export function LimitExceededDialog({
  open,
  onOpenChange,
  resourceType,
  message,
  creditsNeeded,
}: LimitExceededDialogProps) {
  const [, setLocation] = useLocation();

  const resourceLabel = resourceType ? resourceLabels[resourceType] || resourceType : "item";

  const handleUpgrade = () => {
    onOpenChange(false);
    setLocation("/billing");
  };

  const defaultMessage = creditsNeeded 
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
            <DialogTitle>Credits Limit Reached</DialogTitle>
          </div>
          <DialogDescription className="pt-3">
            {message || defaultMessage}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="h-4 w-4 text-primary" />
              <span>Upgrade for more credits</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Higher plans include more monthly credits and additional features. 
              Credits reset at the start of each billing cycle.
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
