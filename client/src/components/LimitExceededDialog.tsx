import { AlertTriangle } from "lucide-react";
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
}

const resourceLabels: Record<string, string> = {
  projects: "Projects",
  tasks: "Tasks",
  documents: "Documents",
  ai_runs: "AI Credits",
};

export function LimitExceededDialog({
  open,
  onOpenChange,
  resourceType,
  message,
}: LimitExceededDialogProps) {
  const [, setLocation] = useLocation();

  const resourceLabel = resourceType ? resourceLabels[resourceType] || resourceType : "resources";

  const handleUpgrade = () => {
    onOpenChange(false);
    setLocation("/billing");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            </div>
            <DialogTitle>Plan Limit Reached</DialogTitle>
          </div>
          <DialogDescription className="pt-3">
            {message || `You've reached your plan's limit for ${resourceLabel}. Upgrade your plan to continue creating more.`}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">
              Upgrading unlocks higher limits, additional features, and priority support. 
              View our plans to find the best fit for your needs.
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
