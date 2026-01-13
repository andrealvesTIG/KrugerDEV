import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Download, Share2, Copy, Table, Loader2, FileSpreadsheet, FileText, Mail } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { ShareReportDialog } from "./ShareReportDialog";

interface DashboardActionBarProps {
  title: string;
  dashboardType: string;
  organizationId: number;
  onExportCsv?: () => void;
  className?: string;
}

export function DashboardActionBar({ title, dashboardType, organizationId, onExportCsv, className = "" }: DashboardActionBarProps) {
  const { toast } = useToast();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const exportMutation = useMutation({
    mutationFn: async (format: "pptx" | "pdf") => {
      if (!organizationId || organizationId === 0) {
        throw new Error("No organization selected");
      }
      const response = await fetch(`/api/dashboard/${dashboardType}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ format, organizationId }),
      });
      if (!response.ok) {
        throw new Error("Export failed");
      }
      return { blob: await response.blob(), format };
    },
    onSuccess: ({ blob, format }) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dashboardType}-dashboard.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({
        title: "Export Complete",
        description: format === "pptx" ? "PowerPoint has been downloaded" : "PDF has been downloaded",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export Failed",
        description: error.message === "No organization selected" 
          ? "Please select an organization first" 
          : "Could not generate export",
        variant: "destructive",
      });
    },
  });

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Dashboard link copied to clipboard",
    });
  };

  const handleExportCsv = () => {
    if (!onExportCsv) return;
    onExportCsv();
    toast({
      title: "Export Complete",
      description: "CSV has been downloaded",
    });
  };

  const isExporting = exportMutation.isPending;
  const isOrgReady = organizationId && organizationId > 0;

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" disabled={!isOrgReady} data-testid="button-download-dashboard">
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => exportMutation.mutate("pdf")} 
              disabled={isExporting || !isOrgReady}
              data-testid="menu-export-pdf"
            >
              <FileText className="h-4 w-4 mr-2 text-red-500" />
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => exportMutation.mutate("pptx")} 
              disabled={isExporting || !isOrgReady}
              data-testid="menu-export-pptx"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2 text-orange-500" />
              Export as PowerPoint
            </DropdownMenuItem>
            {onExportCsv && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCsv} disabled={!isOrgReady} data-testid="menu-export-csv">
                  <Table className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" disabled={!isOrgReady} data-testid="button-share-dashboard">
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyLink} data-testid="menu-copy-link">
              <Copy className="h-4 w-4 mr-2" />
              Copy Link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShareDialogOpen(true)} disabled={!isOrgReady} data-testid="menu-share-email">
              <Mail className="h-4 w-4 mr-2" />
              Share via Email
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ShareReportDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        dashboardType={dashboardType}
        organizationId={organizationId}
      />
    </>
  );
}
