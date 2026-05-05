import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bookmark,
  ExternalLink,
  Trash2,
  Loader2,
  FileText,
  Share2,
  Link2,
  ArrowRight,
} from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ShareReportDialog, type ShareableReport } from "./ShareReportDialog";

interface SavedReportSummary {
  id: number;
  organizationId: number;
  savedByUserId: string | null;
  title: string;
  subtitle: string | null;
  generatedAt: string | null;
  createdAt: string;
  shareToken?: string | null;
  sharedAt?: string | null;
  shareExpiresAt?: string | null;
  shareRevokedAt?: string | null;
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return d.toLocaleDateString();
}

interface SavedReportsMenuProps {
  align?: "start" | "end";
  triggerClassName?: string;
  alwaysVisibleLabel?: string;
}

export function SavedReportsMenu({
  align = "end",
  triggerClassName,
  alwaysVisibleLabel,
}: SavedReportsMenuProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareableReport | null>(null);

  const { data: reports = [], isLoading } = useQuery<SavedReportSummary[]>({
    queryKey: ["/api/jarvis/saved-reports", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(
        `/api/jarvis/saved-reports?organizationId=${orgId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load saved reports");
      return res.json();
    },
    enabled: !!orgId && open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!orgId) throw new Error("No active organization");
      await apiRequest(
        "DELETE",
        `/api/jarvis/saved-reports/${id}?organizationId=${orgId}`,
      );
    },
    onSuccess: (_, id) => {
      queryClient.setQueryData<SavedReportSummary[]>(
        ["/api/jarvis/saved-reports", orgId],
        (prev) => (prev ? prev.filter((r) => r.id !== id) : prev),
      );
      toast({ title: "Report deleted" });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't delete report",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleOpen = (id: number) => {
    window.open(`/friday-report/${id}`, "_blank", "noopener");
    setOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    deleteMutation.mutate(id);
  };

  const handleShare = (e: React.MouseEvent, r: SavedReportSummary) => {
    e.preventDefault();
    e.stopPropagation();
    setShareTarget({
      id: r.id,
      organizationId: r.organizationId,
      title: r.title,
      shareToken: r.shareToken ?? null,
      sharedAt: r.sharedAt ?? null,
      shareExpiresAt: r.shareExpiresAt ?? null,
      shareRevokedAt: r.shareRevokedAt ?? null,
    });
    setOpen(false);
  };

  const count = reports.length;

  return (
    <>
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 px-2 gap-1.5 ${triggerClassName ?? ""}`}
          aria-label={
            count > 0 ? `Saved reports (${count})` : "Saved reports"
          }
          title="Saved reports"
          data-testid="button-friday-saved-reports"
        >
          <Bookmark className="h-3.5 w-3.5" />
          <span className="text-xs hidden sm:inline">
            {alwaysVisibleLabel ?? "Saved"}
          </span>
          {count > 0 && (
            <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 leading-none">
              {count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={8}
        // AiModePage renders at z-[200], so the default Radix z-50 would
        // put this dropdown behind the overlay and make it unclickable.
        className="w-80 max-h-[60vh] overflow-y-auto z-[300]"
      >
        <DropdownMenuLabel className="flex items-center gap-2">
          <Bookmark className="h-3.5 w-3.5" /> Saved Reports
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            <FileText className="h-5 w-5 mx-auto mb-2 opacity-40" />
            No saved reports yet.
            <div className="mt-1 opacity-70">
              Click <span className="font-medium">Save</span> on any Friday
              report to keep it here.
            </div>
          </div>
        ) : (
          <>
          {reports.map((r) => (
            <DropdownMenuItem
              key={r.id}
              className="group flex items-start gap-2 py-2 pr-2 cursor-pointer"
              onClick={() => handleOpen(r.id)}
              data-testid={`saved-report-item-${r.id}`}
            >
              <FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium truncate"
                  data-testid={`saved-report-title-${r.id}`}
                >
                  {r.title}
                </div>
                {r.subtitle && (
                  <div className="text-[11px] text-muted-foreground truncate">
                    {r.subtitle}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                  Saved {formatRelative(r.createdAt)}
                  {r.generatedAt && r.createdAt !== r.generatedAt
                    ? ` • Generated ${formatRelative(r.generatedAt)}`
                    : ""}
                </div>
              </div>
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="Open in new tab"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpen(r.id);
                  }}
                  data-testid={`saved-report-open-${r.id}`}
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={
                    "p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground " +
                    (r.shareToken
                      ? "text-emerald-600 dark:text-emerald-400 opacity-100"
                      : "")
                  }
                  aria-label={r.shareToken ? "Manage share link" : "Share report"}
                  title={r.shareToken ? "Share link active — click to manage" : "Share report"}
                  onClick={(e) => handleShare(e, r)}
                  data-testid={`saved-report-share-${r.id}`}
                >
                  {r.shareToken ? (
                    <Link2 className="h-3 w-3" />
                  ) : (
                    <Share2 className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  aria-label="Delete saved report"
                  onClick={(e) => handleDelete(e, r.id)}
                  data-testid={`saved-report-delete-${r.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </DropdownMenuItem>
          ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setOpen(false);
            setLocation("/dashboards?view=agent-reports-overview");
          }}
          className="text-xs justify-center text-muted-foreground hover:text-foreground"
          data-testid="button-saved-reports-view-all"
        >
          <span>View all in Agent Reports</span>
          <ArrowRight className="h-3 w-3 ml-1.5" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <ShareReportDialog
      open={!!shareTarget}
      onOpenChange={(o) => {
        if (!o) setShareTarget(null);
      }}
      report={shareTarget}
    />
    </>
  );
}
