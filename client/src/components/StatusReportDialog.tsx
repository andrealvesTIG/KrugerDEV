import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { pdf } from "@react-pdf/renderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ProjectStatusReport } from "./ProjectStatusReport";
import { ProjectStatusReportPDF } from "./ProjectStatusReportPDF";
import { Download, Mail, Loader2, FileText, Eye } from "lucide-react";
import type { Project, Risk, Issue, Milestone, ProjectFinancial, Task, ChangeRequest, ProjectDocument } from "@shared/schema";

interface StatusReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  risks: Risk[];
  issues: Issue[];
  milestones: Milestone[];
  financials: ProjectFinancial[];
  tasks: Task[];
  changeRequests?: ChangeRequest[];
  documents?: ProjectDocument[];
}

export function StatusReportDialog({
  open,
  onOpenChange,
  project,
  risks,
  issues,
  milestones,
  financials,
  tasks,
  changeRequests = [],
  documents = []
}: StatusReportDialogProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"preview" | "download" | "email">("preview");
  const [executiveSummary, setExecutiveSummary] = useState(project.description || "");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const emailMutation = useMutation({
    mutationFn: async () => {
      const doc = (
        <ProjectStatusReportPDF
          project={project}
          risks={risks}
          issues={issues}
          milestones={milestones}
          financials={financials}
          tasks={tasks}
          changeRequests={changeRequests}
          documents={documents}
          executiveSummary={executiveSummary}
        />
      );
      
      const blob = await pdf(doc).toBlob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      const pdfFileName = `${project.name.replace(/[^a-z0-9]/gi, "_")}_Comprehensive_Status_Report.pdf`;
      
      return apiRequest("POST", `/api/projects/${project.id}/status-report/email`, {
        recipientEmail,
        executiveSummary,
        pdfBase64: base64,
        pdfFileName
      });
    },
    onSuccess: () => {
      toast({
        title: "Report Sent",
        description: `Status report with PDF attachment sent to ${recipientEmail}`
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send",
        description: error?.message || "Could not send the status report. Please check email settings.",
        variant: "destructive"
      });
    }
  });

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const doc = (
        <ProjectStatusReportPDF
          project={project}
          risks={risks}
          issues={issues}
          milestones={milestones}
          financials={financials}
          tasks={tasks}
          changeRequests={changeRequests}
          documents={documents}
          executiveSummary={executiveSummary}
        />
      );
      
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.name.replace(/[^a-z0-9]/gi, "_")}_Comprehensive_Status_Report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download Started",
        description: "Your PDF report is being downloaded."
      });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Download Failed",
        description: "Could not generate the PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSendEmail = () => {
    if (!recipientEmail) {
      toast({
        title: "Email Required",
        description: "Please enter a recipient email address.",
        variant: "destructive"
      });
      return;
    }
    emailMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Comprehensive Project Status Report
          </DialogTitle>
          <DialogDescription>
            Preview, download, or share the status report for {project.name}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preview" className="flex items-center gap-2" data-testid="tab-preview">
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="download" className="flex items-center gap-2" data-testid="tab-download">
              <Download className="h-4 w-4" />
              Download
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2" data-testid="tab-email">
              <Mail className="h-4 w-4" />
              Share
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="flex-1 mt-4 min-h-0">
            <ScrollArea className="h-[500px] border rounded-lg">
              <ProjectStatusReport
                project={project}
                risks={risks}
                issues={issues}
                milestones={milestones}
                financials={financials}
                tasks={tasks}
                changeRequests={changeRequests}
                documents={documents}
                executiveSummary={executiveSummary}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="download" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exec-summary-download">Executive Summary (optional)</Label>
              <Textarea
                id="exec-summary-download"
                value={executiveSummary}
                onChange={(e) => setExecutiveSummary(e.target.value)}
                placeholder="Add a brief executive summary for the report..."
                className="resize-none h-24"
                data-testid="input-executive-summary-download"
              />
              <p className="text-xs text-muted-foreground">
                This will appear at the top of the report. Leave blank to use the project description.
              </p>
            </div>

            <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/50">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">{project.name}_Comprehensive_Status_Report.pdf</p>
                <p className="text-sm text-muted-foreground">PDF Document</p>
              </div>
              <Button 
                onClick={handleDownloadPdf} 
                disabled={isGeneratingPdf}
                data-testid="button-download-pdf"
              >
                {isGeneratingPdf ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="email" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient-email">Recipient Email *</Label>
              <Input
                id="recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="recipient@example.com"
                data-testid="input-recipient-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exec-summary-email">Executive Summary (optional)</Label>
              <Textarea
                id="exec-summary-email"
                value={executiveSummary}
                onChange={(e) => setExecutiveSummary(e.target.value)}
                placeholder="Add a brief executive summary for the report..."
                className="resize-none h-24"
                data-testid="input-executive-summary-email"
              />
            </div>

            <div className="p-4 border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">
                The recipient will receive an HTML email with the full status report including:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside space-y-1">
                <li>Executive Summary</li>
                <li>Project Health Indicators</li>
                <li>Schedule Progress</li>
                <li>Financial Summary</li>
                <li>Key Risks & Issues</li>
                <li>Major Milestones</li>
              </ul>
            </div>

            <Button 
              onClick={handleSendEmail} 
              disabled={!recipientEmail || emailMutation.isPending}
              className="w-full"
              data-testid="button-send-email"
            >
              {emailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Status Report
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
