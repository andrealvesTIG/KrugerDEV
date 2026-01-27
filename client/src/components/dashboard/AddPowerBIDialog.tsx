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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, BarChart3, ExternalLink, Info } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface AddPowerBIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (dashboardId: number) => void;
}

export function AddPowerBIDialog({
  open,
  onOpenChange,
  onCreated,
}: AddPowerBIDialogProps) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; embedUrl: string }) => {
      const response = await apiRequest("POST", "/api/custom-dashboards", {
        organizationId: currentOrganization?.id,
        userId: user?.id,
        name: data.name,
        description: `Power BI Report: ${data.name}`,
        config: {
          widgets: [
            {
              id: `powerbi-${Date.now()}`,
              type: "powerbi-embed",
              title: data.name,
              dataSource: "external",
              size: "full",
              embedUrl: data.embedUrl,
            },
          ],
          layout: "grid",
        },
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/custom-dashboards?organizationId=${currentOrganization?.id}`],
      });
      toast({
        title: "Power BI Report Added",
        description: "Your report has been embedded successfully.",
      });
      setName("");
      setEmbedUrl("");
      onOpenChange(false);
      onCreated(data.id);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add Power BI report",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || !embedUrl.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both a name and embed URL",
        variant: "destructive",
      });
      return;
    }

    if (!embedUrl.includes("powerbi.com") && !embedUrl.includes("powerbi.")) {
      toast({
        title: "Invalid URL",
        description: "Please provide a valid Power BI embed URL",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({ name, embedUrl });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-amber-500" />
            Add Power BI Report
          </DialogTitle>
          <DialogDescription>
            Embed a Power BI report using the publish to web iframe sharing feature.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="report-name">Report Name</Label>
            <Input
              id="report-name"
              placeholder="e.g., Monthly Sales Dashboard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-powerbi-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="embed-url">Power BI Embed URL</Label>
            <Input
              id="embed-url"
              placeholder="https://app.powerbi.com/reportEmbed?..."
              value={embedUrl}
              onChange={(e) => setEmbedUrl(e.target.value)}
              data-testid="input-powerbi-url"
            />
            <p className="text-xs text-muted-foreground">
              Paste the iframe src URL from Power BI's "Publish to web" feature
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="instructions" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm py-2">
                <span className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  How to get the embed URL from Power BI
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-3">
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    Open your report in{" "}
                    <a
                      href="https://app.powerbi.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Power BI Service <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>
                    Click <strong>File</strong> → <strong>Embed report</strong> → <strong>Publish to web (public)</strong>
                  </li>
                  <li>
                    If prompted, click <strong>Create embed code</strong> and confirm
                  </li>
                  <li>
                    In the dialog that appears, find the <strong>iframe</strong> HTML code
                  </li>
                  <li>
                    Copy the URL from the <code className="bg-muted px-1 rounded">src="..."</code> attribute
                    <br />
                    <span className="text-xs">
                      Example: <code className="bg-muted px-1 rounded text-xs">https://app.powerbi.com/reportEmbed?reportId=...</code>
                    </span>
                  </li>
                  <li>Paste that URL in the field above</li>
                </ol>

                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 mt-3">
                  <p className="text-amber-800 dark:text-amber-200 text-xs">
                    <strong>Note:</strong> "Publish to web" makes your report publicly accessible. 
                    For sensitive data, consider using Power BI Embedded with authentication instead.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
            data-testid="button-cancel-powerbi"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !name.trim() || !embedUrl.trim()}
            data-testid="button-add-powerbi"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <BarChart3 className="h-4 w-4 mr-2" />
                Add Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
