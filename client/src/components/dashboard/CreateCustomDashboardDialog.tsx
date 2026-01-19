import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CreateCustomDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (dashboardId: number) => void;
}

export function CreateCustomDashboardDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateCustomDashboardDialogProps) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: async (description: string) => {
      const response = await apiRequest('POST', '/api/custom-dashboards/generate', {
        description,
        organizationId: currentOrganization?.id,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Dashboard created", description: "Your custom dashboard is ready!" });
      queryClient.invalidateQueries({ queryKey: ['/api/custom-dashboards'] });
      setDescription("");
      onOpenChange(false);
      onCreated(data.id);
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to create dashboard. Please try again.", 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = () => {
    if (!description.trim()) {
      toast({ title: "Please describe your dashboard", variant: "destructive" });
      return;
    }
    createMutation.mutate(description);
  };

  const examples = [
    "Show me project health trends and risk distribution",
    "Overview of task completion rates by project",
    "Resource utilization and budget tracking",
    "Issues and risks breakdown by severity",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create Custom Dashboard
          </DialogTitle>
          <DialogDescription>
            Describe the dashboard you want to create. AI will generate the appropriate charts and visualizations based on your data.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="description">What would you like to see in your dashboard?</Label>
            <Textarea
              id="description"
              placeholder="e.g., Show me project health distribution and task completion trends..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-dashboard-description"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Examples:</Label>
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <Button
                  key={example}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setDescription(example)}
                  data-testid={`example-${example.slice(0, 20)}`}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
            data-testid="button-cancel-dashboard"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !description.trim()}
            data-testid="button-create-dashboard"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Create Dashboard
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
