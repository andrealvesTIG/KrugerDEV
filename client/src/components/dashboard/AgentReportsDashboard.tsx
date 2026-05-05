import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText,
  ExternalLink,
  Share2,
  Link2,
  Trash2,
  Download,
  Loader2,
  Search,
} from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ShareReportDialog,
  type ShareableReport,
} from "@/components/jarvis/ShareReportDialog";
import { downloadReportAsPdf } from "@/components/jarvis/FridayReportCard";

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

interface OrgUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

interface OrgMemberRow {
  userId?: string;
  user?: OrgUser | null;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function getUserLabel(
  users: OrgUser[] | undefined,
  userId: string | null,
): string {
  if (!userId) return "Unknown";
  const u = users?.find((x) => x.id === userId);
  if (!u) return "Unknown";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || "Unknown";
}

function normalizeMembers(raw: unknown): OrgUser[] {
  if (!Array.isArray(raw)) return [];
  const out: OrgUser[] = [];
  for (const row of raw as Array<OrgMemberRow | OrgUser>) {
    if (!row || typeof row !== "object") continue;
    if ("user" in row && row.user && typeof row.user === "object") {
      out.push(row.user as OrgUser);
    } else if ("id" in row && typeof (row as OrgUser).id === "string") {
      out.push(row as OrgUser);
    }
  }
  return out;
}

export function AgentReportsDashboard() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [shareTarget, setShareTarget] = useState<ShareableReport | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedReportSummary | null>(null);

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
    enabled: !!orgId,
  });

  // Best-effort: fetch org members so we can show "Saved by <name>".
  const { data: orgUsers } = useQuery<OrgUser[]>({
    queryKey: [`/api/organizations/${orgId}/members`],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(
        `/api/organizations/${orgId}/members`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return normalizeMembers(await res.json());
    },
    enabled: !!orgId,
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.subtitle ?? "").toLowerCase().includes(q),
    );
  }, [reports, search]);

  const handleOpen = (id: number) => {
    window.open(`/friday-report/${id}`, "_blank", "noopener");
  };

  const handleShare = (r: SavedReportSummary) => {
    setShareTarget({
      id: r.id,
      organizationId: r.organizationId,
      title: r.title,
      shareToken: r.shareToken ?? null,
      sharedAt: r.sharedAt ?? null,
      shareExpiresAt: r.shareExpiresAt ?? null,
      shareRevokedAt: r.shareRevokedAt ?? null,
    });
  };

  const handleDownloadPdf = async (r: SavedReportSummary) => {
    if (!orgId) return;
    setPdfBusyId(r.id);
    try {
      const res = await fetch(
        `/api/jarvis/saved-reports/${r.id}?organizationId=${orgId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load report");
      const full = (await res.json()) as {
        title: string;
        subtitle: string | null;
        generatedAt: string | null;
        html: string;
      };
      await downloadReportAsPdf({
        title: full.title,
        subtitle: full.subtitle ?? undefined,
        generatedAt: full.generatedAt ?? undefined,
        html: full.html,
      });
    } catch (err) {
      toast({
        title: "PDF export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPdfBusyId(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="agent-reports-dashboard">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Agent Reports</h2>
          <p className="text-sm text-muted-foreground">
            Every Friday report saved by anyone in this organization.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports…"
            className="pl-8"
            data-testid="input-agent-reports-search"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="text-base font-medium">No saved reports yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Save a report from a Friday chat to see it here.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No reports match “{search}”.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {filtered.map((r) => {
            const savedBy = getUserLabel(orgUsers, r.savedByUserId);
            return (
              <div
                key={r.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40"
                data-testid={`agent-report-row-${r.id}`}
              >
                <FileText className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    className="text-sm font-medium text-left hover:underline truncate block w-full"
                    onClick={() => handleOpen(r.id)}
                    data-testid={`agent-report-title-${r.id}`}
                  >
                    {r.title}
                  </button>
                  {r.subtitle && (
                    <div className="text-xs text-muted-foreground truncate">
                      {r.subtitle}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground/80 mt-1 flex flex-wrap gap-x-3">
                    <span>Saved by {savedBy}</span>
                    <span>Saved {formatDate(r.createdAt)}</span>
                    {r.generatedAt && (
                      <span>Generated {formatDate(r.generatedAt)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpen(r.id)}
                    data-testid={`agent-report-open-${r.id}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Open</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleShare(r)}
                    data-testid={`agent-report-share-${r.id}`}
                  >
                    {r.shareToken ? (
                      <Link2 className="h-3.5 w-3.5 sm:mr-1 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Share2 className="h-3.5 w-3.5 sm:mr-1" />
                    )}
                    <span className="hidden sm:inline">Share</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadPdf(r)}
                    disabled={pdfBusyId === r.id}
                    data-testid={`agent-report-pdf-${r.id}`}
                  >
                    {pdfBusyId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 sm:mr-1 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5 sm:mr-1" />
                    )}
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(r)}
                    data-testid={`agent-report-delete-${r.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 sm:mr-1 text-destructive" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ShareReportDialog
        open={!!shareTarget}
        onOpenChange={(o) => {
          if (!o) setShareTarget(null);
        }}
        report={shareTarget}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-delete-report">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saved report?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.title
                ? `"${confirmDelete.title}" will be permanently removed for everyone in this organization.`
                : "This report will be permanently removed for everyone in this organization."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-report">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) {
                  deleteMutation.mutate(confirmDelete.id);
                  setConfirmDelete(null);
                }
              }}
              data-testid="button-confirm-delete-report"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
