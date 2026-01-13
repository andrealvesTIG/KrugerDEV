import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Mail, FileSpreadsheet, FileText, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ShareReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardType: string;
  organizationId: number;
}

export function ShareReportDialog({ open, onOpenChange, dashboardType, organizationId }: ShareReportDialogProps) {
  const { toast } = useToast();
  const [emails, setEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState("");
  const [message, setMessage] = useState("");
  const [includePptx, setIncludePptx] = useState(true);

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || organizationId === 0) {
        throw new Error("No organization selected");
      }
      if (emails.length === 0) {
        throw new Error("No recipients specified");
      }
      const formats: string[] = [];
      if (includePptx) formats.push("pptx");
      
      return apiRequest("POST", `/api/dashboard/${dashboardType}/share`, {
        recipients: emails,
        organizationId,
        formats,
        message,
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Report Shared",
        description: `Report sent to ${data.sent} of ${data.total} recipients`,
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      let description = "Could not send the report. Please try again.";
      if (error.message === "No organization selected") {
        description = "Please select an organization first";
      } else if (error.message === "No recipients specified") {
        description = "Please add at least one recipient email";
      }
      toast({
        title: "Share Failed",
        description,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setEmails([]);
    setCurrentEmail("");
    setMessage("");
    setIncludePptx(true);
  };

  const addEmail = () => {
    const trimmed = currentEmail.trim().toLowerCase();
    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !emails.includes(trimmed)) {
      setEmails([...emails, trimmed]);
      setCurrentEmail("");
    }
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Share Dashboard Report
          </DialogTitle>
          <DialogDescription>
            Send this dashboard report to colleagues via email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="recipients">Recipients</Label>
            <div className="flex gap-2">
              <Input
                id="recipients"
                data-testid="input-share-email"
                placeholder="Enter email address"
                value={currentEmail}
                onChange={(e) => setCurrentEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addEmail}
              />
              <Button type="button" variant="outline" onClick={addEmail} data-testid="button-add-email">
                Add
              </Button>
            </div>
            {emails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {emails.map((email) => (
                  <Badge key={email} variant="secondary" className="gap-1">
                    {email}
                    <button onClick={() => removeEmail(email)} className="ml-1 hover:text-destructive" data-testid={`button-remove-email-${email}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              data-testid="textarea-share-message"
              placeholder="Add a personal message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-3">
            <Label>Attachments</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-pptx"
                data-testid="checkbox-include-pptx"
                checked={includePptx}
                onCheckedChange={(checked) => setIncludePptx(checked === true)}
              />
              <label htmlFor="include-pptx" className="flex items-center gap-2 text-sm cursor-pointer">
                <FileSpreadsheet className="h-4 w-4 text-orange-500" />
                Attach PowerPoint (.pptx)
              </label>
            </div>
          </div>

          <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>The email will include an HTML version of the dashboard report with all key metrics.</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={shareMutation.isPending} data-testid="button-cancel-share">
            Cancel
          </Button>
          <Button
            onClick={() => shareMutation.mutate()}
            disabled={emails.length === 0 || shareMutation.isPending}
            data-testid="button-send-share"
          >
            {shareMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Send Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
