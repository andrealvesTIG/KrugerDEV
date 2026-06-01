import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink, CheckCircle2, AlertCircle, Cloud, Clock, AlertTriangle } from "lucide-react";

interface ProjectOnlineStatus {
  configured: boolean;
  connected: boolean;
  siteUrl: string | null;
}

interface PreviewResult {
  totalRows: number;
  matchedRows: number;
  entriesToWrite: number;
  totalHours: number;
  matchedHours: number;
  unmatched: { name: string; reason: string; hours: number }[];
  unmatchedCount: number;
  resourcesToCreate: string[];
  resourcesToCreateCount: number;
}

interface ImportResult {
  inserted: number;
  updated: number;
  conflicts: number;
  failed: number;
  unmatched: number;
  unmatchedSample: { name: string; reason: string; hours: number }[];
  totalHours: number;
  resourcesCreated: number;
  resourcesCreateFailed: number;
}

type WizardStep = "connect" | "configure" | "preview" | "importing" | "complete";
type ImportStatus = "Draft" | "Submitted" | "Approved";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
}

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 28);
  return d.toISOString().split("T")[0];
}
function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function ProjectOnlineTimesheetWizard({ open, onOpenChange, organizationId }: Props) {
  const [step, setStep] = useState<WizardStep>("connect");
  const [siteUrl, setSiteUrl] = useState("");
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(today());
  const [importStatus, setImportStatus] = useState<ImportStatus>("Submitted");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressPhase, setProgressPhase] = useState<"resources" | "entries">("entries");
  const { toast } = useToast();

  const { data: status, refetch: refetchStatus } = useQuery<ProjectOnlineStatus>({
    queryKey: ["/api/project-online/status"],
    enabled: open,
  });

  useEffect(() => {
    if (open && step === "connect" && status?.connected) {
      setStep("configure");
    }
  }, [open, step, status?.connected]);

  const connectMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/project-online/connect", { siteUrl: url });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.authUrl) window.location.href = data.authUrl;
    },
    onError: (err: any) => {
      toast({ title: "Connection Failed", description: err.message, variant: "destructive" });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/project-online/timesheets/preview", {
        organizationId,
        startDate,
        endDate,
        status: importStatus,
      });
      return response.json() as Promise<PreviewResult>;
    },
    onSuccess: (data) => {
      setPreview(data);
      setStep("preview");
    },
    onError: (err: any) => {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      setProgressCurrent(0);
      setProgressTotal(preview?.entriesToWrite || 0);
      const response = await fetch("/api/project-online/timesheets/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ organizationId, startDate, endDate, status: importStatus }),
      });
      if (!response.ok || !response.body) {
        let msg = `Sync failed (${response.status})`;
        try {
          const txt = await response.text();
          if (txt) msg = txt;
        } catch {}
        throw new Error(msg);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: ImportResult | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let evt: any;
          try {
            evt = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (evt.type === "creating-resources") {
            setProgressPhase("resources");
            setProgressCurrent(0);
            setProgressTotal(evt.total || 0);
          } else if (evt.type === "creating-resources-progress") {
            setProgressPhase("resources");
            setProgressCurrent(evt.current || 0);
            setProgressTotal(evt.total || 0);
          } else if (evt.type === "matched") {
            setProgressPhase("entries");
            setProgressCurrent(0);
            setProgressTotal(evt.total || 0);
          } else if (evt.type === "progress") {
            setProgressPhase("entries");
            setProgressCurrent(evt.current || 0);
            setProgressTotal(evt.total || 0);
          } else if (evt.type === "session-expired") {
            throw new Error(evt.message || "Project Online session expired. Please reconnect.");
          } else if (evt.type === "done") {
            final = evt as ImportResult;
          } else if (evt.type === "error") {
            throw new Error(evt.message || "Sync failed");
          }
        }
      }
      return final ?? { inserted: 0, updated: 0, conflicts: 0, failed: 0, unmatched: 0, unmatchedSample: [], totalHours: 0, resourcesCreated: 0, resourcesCreateFailed: 0 };
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("complete");
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/approval"] });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
      setStep("preview");
      refetchStatus();
    },
  });

  const handleConnect = () => {
    if (!siteUrl.trim()) {
      toast({ title: "Error", description: "Please enter your Project Online site URL", variant: "destructive" });
      return;
    }
    connectMutation.mutate(siteUrl.trim());
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(status?.connected ? "configure" : "connect");
      setPreview(null);
      setResult(null);
      setProgressCurrent(0);
      setProgressTotal(0);
    }, 300);
  };

  const renderStep = () => {
    if (step === "connect" && !status?.connected) {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-center py-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Cloud className="w-8 h-8 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ts-siteUrl">Project Online Site URL</Label>
            <Input
              id="ts-siteUrl"
              placeholder="https://yourcompany.sharepoint.com/sites/pwa"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              data-testid="input-timesheet-site-url"
            />
            <p className="text-xs text-muted-foreground">
              Connect to your Project Web App (PWA) site. This reuses the same connection as the Project Online import.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleConnect} disabled={connectMutation.isPending || !siteUrl.trim()} data-testid="button-connect-timesheet">
              {connectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Connect to Microsoft
            </Button>
          </DialogFooter>
        </div>
      );
    }

    if (step === "configure") {
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm text-muted-foreground">Connected to: {status?.siteUrl}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ts-start">From date</Label>
              <Input id="ts-start" type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-timesheet-start" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ts-end">To date</Label>
              <Input id="ts-end" type="date" value={endDate} min={startDate} max={today()} onChange={(e) => setEndDate(e.target.value)} data-testid="input-timesheet-end" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Bring entries in as</Label>
            <Select value={importStatus} onValueChange={(v) => setImportStatus(v as ImportStatus)}>
              <SelectTrigger data-testid="select-timesheet-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Draft">Draft — people can still edit</SelectItem>
                <SelectItem value="Submitted">Submitted — waiting for approval</SelectItem>
                <SelectItem value="Approved">Approved — final</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground space-y-1">
            <p>This pulls actual hours that resources logged in Project Online and matches them to people, projects, and tasks already in this workspace.</p>
            <p>Nothing is created automatically. Manually entered time is never overwritten. Project for the Web / Planner Premium timesheets are not supported.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} data-testid="button-preview-timesheet">
              {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
              Preview
            </Button>
          </DialogFooter>
        </div>
      );
    }

    if (step === "preview" && preview) {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-semibold">{preview.entriesToWrite}</div>
              <div className="text-xs text-muted-foreground">entries to sync</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-semibold">{preview.matchedHours}h</div>
              <div className="text-xs text-muted-foreground">matched hours</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-semibold">{preview.unmatchedCount}</div>
              <div className="text-xs text-muted-foreground">could not match</div>
            </div>
          </div>
          {preview.resourcesToCreateCount > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-blue-700 dark:text-blue-300">
                <AlertCircle className="h-4 w-4" />
                {preview.resourcesToCreateCount} new {preview.resourcesToCreateCount === 1 ? "person" : "people"} will be added
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                These people aren't in your workspace yet. They'll be created as resources with a
                lightweight account so their hours import too. The accounts can't sign in until the
                person logs in normally.
              </p>
              {preview.resourcesToCreate.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground truncate" title={preview.resourcesToCreate.join(", ")}>
                  {preview.resourcesToCreate.slice(0, 8).join(", ")}
                  {preview.resourcesToCreate.length > 8 ? `, +${preview.resourcesToCreate.length - 8} more` : ""}
                </p>
              )}
            </div>
          )}
          {preview.unmatchedCount > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Skipped rows (unknown project or task)
              </div>
              <div className="border rounded-lg max-h-[220px] overflow-y-auto divide-y">
                {preview.unmatched.map((u, i) => (
                  <div key={i} className="p-2 text-sm flex items-center justify-between gap-2" data-testid={`unmatched-row-${i}`}>
                    <span className="truncate" title={u.name}>{u.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{u.reason} · {u.hours}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {preview.entriesToWrite === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Nothing to sync for this date range.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep("configure")}>Back</Button>
            <Button onClick={() => { setStep("importing"); importMutation.mutate(); }} disabled={preview.entriesToWrite === 0} data-testid="button-run-timesheet-sync">
              Sync {preview.entriesToWrite} entr{preview.entriesToWrite === 1 ? "y" : "ies"}
            </Button>
          </DialogFooter>
        </div>
      );
    }

    if (step === "importing") {
      const pct = progressTotal > 0 ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100)) : 0;
      return (
        <div className="flex flex-col py-8 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary shrink-0" />
            <p className="text-sm font-medium">
              {progressPhase === "resources"
                ? `Adding ${progressCurrent} of ${progressTotal} new people…`
                : `Syncing ${progressCurrent} of ${progressTotal} entries…`}
            </p>
          </div>
          <Progress value={pct} />
        </div>
      );
    }

    if (step === "complete" && result) {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-center py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg border p-3"><div className="text-2xl font-semibold">{result.inserted}</div><div className="text-xs text-muted-foreground">added</div></div>
            <div className="rounded-lg border p-3"><div className="text-2xl font-semibold">{result.updated}</div><div className="text-xs text-muted-foreground">updated</div></div>
            <div className="rounded-lg border p-3"><div className="text-2xl font-semibold">{result.conflicts}</div><div className="text-xs text-muted-foreground">skipped (manual entry)</div></div>
            <div className="rounded-lg border p-3"><div className="text-2xl font-semibold">{result.unmatched}</div><div className="text-xs text-muted-foreground">could not match</div></div>
          </div>
          {result.resourcesCreated > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> {result.resourcesCreated} new {result.resourcesCreated === 1 ? "person" : "people"} added to your workspace.
            </div>
          )}
          {result.failed > 0 && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {result.failed} entr{result.failed === 1 ? "y" : "ies"} failed to write.
            </div>
          )}
          {result.resourcesCreateFailed > 0 && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {result.resourcesCreateFailed} new {result.resourcesCreateFailed === 1 ? "person" : "people"} could not be created.
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleClose} data-testid="button-close-timesheet-sync">Done</Button>
          </DialogFooter>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync Project Online Timesheets</DialogTitle>
          <DialogDescription>Pull resource actual hours from Microsoft Project Online into this workspace's timesheets.</DialogDescription>
        </DialogHeader>
        {renderStep()}
      </DialogContent>
    </Dialog>
  );
}
