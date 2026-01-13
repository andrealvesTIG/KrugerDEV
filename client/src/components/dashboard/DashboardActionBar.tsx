import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Download, Share2, Copy, FileText, Table, Loader2 } from "lucide-react";

interface DashboardActionBarProps {
  title: string;
  onExportPdf?: () => Promise<void>;
  onExportCsv?: () => void;
  className?: string;
}

export function DashboardActionBar({ title, onExportPdf, onExportCsv, className = "" }: DashboardActionBarProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Dashboard link copied to clipboard",
    });
  };

  const handleExportPdf = async () => {
    if (!onExportPdf) return;
    setIsExporting(true);
    try {
      await onExportPdf();
      toast({
        title: "Export Complete",
        description: "PDF has been downloaded",
      });
    } catch {
      toast({
        title: "Export Failed",
        description: "Could not generate PDF",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = () => {
    if (!onExportCsv) return;
    onExportCsv();
    toast({
      title: "Export Complete",
      description: "CSV has been downloaded",
    });
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-download-dashboard">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onExportPdf && (
            <DropdownMenuItem onClick={handleExportPdf} disabled={isExporting} data-testid="menu-export-pdf">
              <FileText className="h-4 w-4 mr-2" />
              Export as PDF
            </DropdownMenuItem>
          )}
          {onExportCsv && (
            <DropdownMenuItem onClick={handleExportCsv} data-testid="menu-export-csv">
              <Table className="h-4 w-4 mr-2" />
              Export as CSV
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-share-dashboard">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleCopyLink} data-testid="menu-copy-link">
            <Copy className="h-4 w-4 mr-2" />
            Copy Link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
