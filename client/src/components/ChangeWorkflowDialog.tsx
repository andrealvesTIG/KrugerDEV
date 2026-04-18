import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ChangeWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "project" | "intake";
  organizationId?: number;
  recordId: number;
  currentWorkflowId?: number | null;
  currentStepKey?: string | null;
  onChanged?: () => void;
}

/**
 * Placeholder dialog for changing the workflow assigned to a project or intake.
 *
 * The full configurable-workflow feature (project workflow templates, step
 * mapping, persistence) is not yet wired up on the backend. This stub renders
 * a friendly message so the page can mount without crashing.
 */
export function ChangeWorkflowDialog({
  open,
  onOpenChange,
  type,
}: ChangeWorkflowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Workflow</DialogTitle>
          <DialogDescription>
            Configurable {type} workflows are coming soon. This {type} will
            continue to use the default lifecycle.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ChangeWorkflowDialog;
