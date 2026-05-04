import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Check, Link2, Loader2, Share2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export interface ShareableReport {
  id: number;
  organizationId: number;
  title: string;
  shareToken?: string | null;
  sharedAt?: string | null;
  shareExpiresAt?: string | null;
  shareRevokedAt?: string | null;
}

interface ShareReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ShareableReport | null;
}

type ExpiryChoice = "never" | "7" | "30" | "90" | "365";

interface ShareResponse {
  id: number;
  shareToken: string;
  sharedAt: string;
  sharedByUserId: string | null;
  shareExpiresAt: string | null;
  shareRevokedAt: string | null;
  sharePath: string;
}

function buildShareUrl(token: string | null | undefined): string {
  if (!token) return "";
  if (typeof window === "undefined") return `/r/friday-report/${token}`;
  return `${window.location.origin}/r/friday-report/${token}`;
}

export function ShareReportDialog({
  open,
  onOpenChange,
  report,
}: ShareReportDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expiry, setExpiry] = useState<ExpiryChoice>("never");
  const [copied, setCopied] = useState(false);

  // Reset transient UI state every time a new report is opened so the
  // dialog never shows stale "Copied!" feedback for a different report.
  useEffect(() => {
    if (open) {
      setCopied(false);
      setExpiry("never");
    }
  }, [open, report?.id]);

  const orgId = report?.organizationId;
  const reportId = report?.id;
  const queryKey = orgId ? ["/api/jarvis/saved-reports", orgId] : null;

  const createShare = useMutation({
    mutationFn: async (): Promise<ShareResponse> => {
      if (!reportId || !orgId) throw new Error("Missing report context");
      const res = await apiRequest("POST", `/api/jarvis/saved-reports/${reportId}/share`, {
        organizationId: orgId,
        expiresInDays: expiry === "never" ? null : Number(expiry),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Share link ready",
        description: "Anyone with the link can view this report.",
      });
      if (queryKey) {
        queryClient.setQueryData<ShareableReport[]>(queryKey, (prev) =>
          prev
            ? prev.map((r) =>
                r.id === reportId
                  ? {
                      ...r,
                      shareToken: data.shareToken,
                      sharedAt: data.sharedAt,
                      shareExpiresAt: data.shareExpiresAt,
                      shareRevokedAt: null,
                    }
                  : r,
              )
            : prev,
        );
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't create share link",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const revokeShare = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!reportId || !orgId) throw new Error("Missing report context");
      await apiRequest(
        "DELETE",
        `/api/jarvis/saved-reports/${reportId}/share?organizationId=${orgId}`,
      );
    },
    onSuccess: () => {
      toast({ title: "Share link revoked" });
      if (queryKey) {
        queryClient.setQueryData<ShareableReport[]>(queryKey, (prev) =>
          prev
            ? prev.map((r) =>
                r.id === reportId
                  ? {
                      ...r,
                      shareToken: null,
                      shareRevokedAt: new Date().toISOString(),
                      shareExpiresAt: null,
                    }
                  : r,
              )
            : prev,
        );
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't revoke link",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const activeToken = report?.shareToken ?? null;
  const url = buildShareUrl(activeToken);
  const expiresAt = report?.shareExpiresAt
    ? new Date(report.shareExpiresAt)
    : null;
  const expired = !!expiresAt && expiresAt.getTime() < Date.now();

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not copy";
      toast({ title: "Copy failed", description: msg, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="share-report-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" /> Share report
          </DialogTitle>
          <DialogDescription>
            {report?.title
              ? `Create a public link for “${report.title}”. Anyone with the link can view the report — no login required.`
              : "Create a public link to this report."}
          </DialogDescription>
        </DialogHeader>

        {activeToken && !expired ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Public link</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  readOnly
                  value={url}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                  data-testid="share-report-url"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  data-testid="share-report-copy"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {expiresAt
                  ? `Expires ${expiresAt.toLocaleDateString()}.`
                  : "This link does not expire."}{" "}
                Anyone who has it will be able to read the report until you
                revoke it.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => createShare.mutate()}
                disabled={createShare.isPending}
                data-testid="share-report-rotate"
              >
                {createShare.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Replace link
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => revokeShare.mutate()}
                disabled={revokeShare.isPending}
                data-testid="share-report-revoke"
              >
                {revokeShare.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Revoke
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {expired && (
              <div className="text-xs rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-700 dark:text-amber-300">
                The previous link expired on{" "}
                {expiresAt?.toLocaleDateString()}. Create a fresh one below.
              </div>
            )}
            <div>
              <Label htmlFor="share-expiry" className="text-xs">
                Link expires
              </Label>
              <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryChoice)}>
                <SelectTrigger
                  id="share-expiry"
                  className="mt-1"
                  data-testid="share-report-expiry"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="7">In 7 days</SelectItem>
                  <SelectItem value="30">In 30 days</SelectItem>
                  <SelectItem value="90">In 90 days</SelectItem>
                  <SelectItem value="365">In 1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              The link is unguessable, but anyone who receives it can open the
              report until it expires or you revoke it. Don't share reports
              that contain sensitive data you wouldn't want forwarded.
            </p>
          </div>
        )}

        <DialogFooter className="sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="share-report-close"
          >
            Close
          </Button>
          {(!activeToken || expired) && (
            <Button
              type="button"
              onClick={() => createShare.mutate()}
              disabled={createShare.isPending}
              data-testid="share-report-create"
            >
              {createShare.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Create link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
