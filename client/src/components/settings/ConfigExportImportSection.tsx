import { useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Upload, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props { organizationId: number }
interface Blocker { resource: string; count: number; message: string; }

export function ConfigExportImportSection({ organizationId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [allowForce, setAllowForce] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/export-config`, { credentials: "include" });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const m = disposition.match(/filename="([^"]+)"/);
      const filename = m ? m[1] : `org-${organizationId}-config.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: `Downloaded ${filename}` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // Preflight: check whether import would be blocked before showing the dialog.
    try {
      const res = await fetch(`/api/organizations/${organizationId}/import-config/blockers`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      setBlockers(Array.isArray(data?.blockers) ? data.blockers : []);
    } catch {
      setBlockers([]);
    }
    setAllowForce(false);
    setPendingFile(file);
  }

  async function confirmImport() {
    if (!pendingFile) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      if (allowForce) fd.append("force", "true");
      const res = await fetch(`/api/organizations/${organizationId}/import-config`, {
        method: "POST", body: fd, credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && Array.isArray(data?.blockers)) {
        setBlockers(data.blockers);
        toast({
          title: "Import blocked",
          description: "Target organization has data that references existing configuration. See the dialog for details.",
          variant: "destructive",
        });
        return;
      }
      if (!res.ok) throw new Error(data?.message || `Import failed (${res.status})`);
      await queryClient.invalidateQueries();
      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      toast({
        title: "Import complete",
        description: [
          `Custom fields: ${data.customFieldsImported ?? 0}`,
          `Intake tabs: ${data.intakeTabsImported ?? 0}`,
          `Project form tabs: ${data.projectFormTabsImported ?? 0}`,
          `Intake workflow steps: ${data.intakeWorkflowStepsImported ?? 0}`,
          `Project workflow steps: ${data.projectWorkflowStepsImported ?? 0}`,
          warnings.length ? `${warnings.length} warning(s) — see console` : "",
        ].filter(Boolean).join(" • "),
      });
      if (warnings.length) console.warn("Config import warnings:", warnings);
      setPendingFile(null);
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  const hasBlockers = blockers.length > 0;

  return (
    <Card data-testid="card-config-export-import">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          Configuration export &amp; import
        </CardTitle>
        <CardDescription>
          Download this organization&apos;s configuration (custom fields, intake/project form
          layouts, intake &amp; project workflows + steps, and portable org settings) as a JSON
          file, or replace this organization&apos;s configuration with an uploaded JSON file.
          Operational data (projects, tasks, users, intakes, etc.) is never touched. Import is
          designed for cloning configuration into a fresh organization &mdash; it is blocked if the
          target already has data that references the existing configuration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleExport} disabled={exporting} data-testid="button-export-config">
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export configuration
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            data-testid="button-import-config"
          >
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Import configuration
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFilePicked}
            data-testid="input-import-config-file"
          />
        </div>
      </CardContent>

      <AlertDialog open={!!pendingFile} onOpenChange={(o) => { if (!o) { setPendingFile(null); setBlockers([]); setAllowForce(false); } }}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {hasBlockers ? "Import blocked" : "Replace organization configuration?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {hasBlockers ? (
                  <>
                    <p>
                      This organization already has data that references the existing
                      configuration. Replacing it would either fail with database errors or
                      orphan the following rows:
                    </p>
                    <ul className="list-disc pl-6 text-sm space-y-1" data-testid="list-import-blockers">
                      {blockers.map((b, i) => (
                        <li key={i}><strong>{b.resource}</strong>: {b.message}</li>
                      ))}
                    </ul>
                    <p className="text-sm text-muted-foreground">
                      Recommended: create a new (empty) organization and run the import there.
                    </p>
                    <label className="flex items-start gap-2 text-sm pt-2">
                      <input
                        type="checkbox"
                        checked={allowForce}
                        onChange={e => setAllowForce(e.target.checked)}
                        className="mt-1"
                        data-testid="checkbox-force-import"
                      />
                      <span>
                        I understand the risks. Force the import anyway (will fail on FK
                        violations and may orphan workflow references).
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    <p>
                      This will <strong>replace</strong> this organization&apos;s custom fields,
                      intake form layout, intake &amp; project workflows + steps, project form
                      layout, and portable org settings with the contents of{" "}
                      <code>{pendingFile?.name}</code>.
                    </p>
                    <p>
                      Existing rows in those tables will be deleted. Operational data (projects,
                      tasks, users, intakes, etc.) is not affected. This action cannot be undone.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-import-config">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmImport}
              disabled={hasBlockers && !allowForce}
              data-testid="button-confirm-import-config"
            >
              {hasBlockers ? "Force replace" : "Replace configuration"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
