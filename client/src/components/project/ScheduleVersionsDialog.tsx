import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  History, Eye, GitCompare, RotateCcw, Download, Loader2, Plus, Minus, Pencil,
  CheckCircle2, FileText,
} from "lucide-react";
import { SiOracle } from "react-icons/si";
import msprojectLogoPath from "@/assets/msproject-logo.png";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ScheduleVersion, ScheduleVersionTask } from "@shared/schema";

function isP6FileType(fileType: string | null | undefined): boolean {
  const ft = (fileType || "").toLowerCase();
  return ft === "xer" || ft === "p6xml";
}

function SourceSystemIcon({ fileType, className }: { fileType: string | null | undefined; className?: string }) {
  if (isP6FileType(fileType)) {
    return <SiOracle className={cn("text-red-600 shrink-0", className)} aria-label="Primavera P6" />;
  }
  return <img src={msprojectLogoPath} alt="Microsoft Project" className={cn("shrink-0", className)} />;
}

export type EnrichedScheduleVersion = ScheduleVersion & { importedByName?: string | null };

type ChangedDiffEntry = {
  before: ScheduleVersionTask;
  after: ScheduleVersionTask;
  changedFields: string[];
};
type DiffResult = {
  fromVersion: ScheduleVersion;
  toVersion: ScheduleVersion;
  added: ScheduleVersionTask[];
  removed: ScheduleVersionTask[];
  changed: ChangedDiffEntry[];
  unchangedCount: number;
};

function snapshotKey(t: ScheduleVersionTask): string {
  if (t.externalId != null) return `ext:${t.externalId}`;
  if (t.wbs) return `wbs:${t.wbs}`;
  return `name:${t.name}:${t.id}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  isP6Imported: boolean;
  /**
   * Called when the user clicks Preview on a version. The parent is
   * responsible for switching the tasks tab into in-tab read-only preview
   * mode and closing this sheet.
   */
  onPreviewVersion?: (version: EnrichedScheduleVersion) => void;
  /**
   * When provided, the compare dialog is pre-loaded with these two version
   * ids the next time the sheet opens. Used by the "what changed" banner
   * to deep-link straight into the diff for the latest two versions.
   */
  initialCompare?: { fromId: number; toId: number } | null;
  /**
   * Called once the initialCompare has been consumed so the parent can
   * clear it and avoid re-triggering on subsequent opens.
   */
  onInitialCompareConsumed?: () => void;
}

function formatDateLabel(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    return format(date, "MMM d, yyyy h:mm a");
  } catch {
    return String(d);
  }
}

function FieldDiffRow({
  field, before, after,
}: { field: string; before: unknown; after: unknown }) {
  const fmt = (v: unknown) => {
    if (v == null || v === "") return <span className="text-muted-foreground italic">empty</span>;
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  };
  return (
    <div className="grid grid-cols-[120px_1fr_1fr] gap-2 items-center text-sm py-1 border-b last:border-b-0">
      <span className="font-mono text-xs text-muted-foreground">{field}</span>
      <div className="bg-rose-50 dark:bg-rose-950/30 px-2 py-1 rounded text-rose-900 dark:text-rose-200">
        {fmt(before)}
      </div>
      <div className="bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded text-emerald-900 dark:text-emerald-200">
        {fmt(after)}
      </div>
    </div>
  );
}

export default function ScheduleVersionsDialog({
  open,
  onOpenChange,
  projectId,
  isP6Imported,
  onPreviewVersion,
  initialCompare,
  onInitialCompareConsumed,
}: Props) {
  const { toast } = useToast();
  const [compareFromId, setCompareFromId] = useState<number | null>(null);
  const [compareToId, setCompareToId] = useState<number | null>(null);
  const [restoreVersion, setRestoreVersion] = useState<EnrichedScheduleVersion | null>(null);

  // When the parent passes an initialCompare and the sheet opens, auto-load
  // the compare dialog with those versions and immediately notify the
  // parent so it can clear the prop.
  useEffect(() => {
    if (open && initialCompare) {
      setCompareFromId(initialCompare.fromId);
      setCompareToId(initialCompare.toId);
      onInitialCompareConsumed?.();
    }
    // We intentionally only react to `open` and `initialCompare` identity
    // changes — onInitialCompareConsumed is treated as a stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCompare]);

  const versionsQuery = useQuery<EnrichedScheduleVersion[]>({
    queryKey: ["/api/projects", projectId, "schedule-versions"],
    enabled: open,
  });

  const versions = versionsQuery.data ?? [];

  const diffQuery = useQuery<DiffResult>({
    queryKey: [
      "/api/projects", projectId, "schedule-versions", "diff",
      compareFromId, compareToId,
    ],
    enabled: compareFromId != null && compareToId != null && compareFromId !== compareToId,
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/schedule-versions/diff?from=${compareFromId}&to=${compareToId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load diff");
      return res.json();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/projects/${projectId}/schedule-versions/${versionId}/restore`,
        {},
      );
      return res.json();
    },
    onSuccess: (data: { message?: string; tasksRestored?: number }) => {
      toast({
        title: "Version restored",
        description: data.message || `Restored ${data.tasksRestored ?? 0} tasks.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule-versions"] });
      setRestoreVersion(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Restore failed",
        description: err.message || "Could not restore version.",
        variant: "destructive",
      });
    },
  });

  const accentClass = isP6Imported
    ? "text-rose-700 dark:text-rose-300"
    : "text-emerald-700 dark:text-emerald-300";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto"
          data-testid="sheet-schedule-versions"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className={cn("h-5 w-5", accentClass)} />
              Schedule Version History
            </SheetTitle>
            <SheetDescription>
              Each re-import creates a new numbered version. Preview, compare, restore,
              or download the original file from any version.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {versionsQuery.isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {versionsQuery.isError && (
              <div className="text-sm text-destructive py-4">
                Failed to load version history.
              </div>
            )}
            {!versionsQuery.isLoading && versions.length === 0 && (
              <div className="text-sm text-muted-foreground py-12 text-center">
                No schedule versions yet. Re-import a file to create one.
              </div>
            )}
            {versions.map((v) => (
              <div
                key={v.id}
                className={cn(
                  "border rounded-lg p-3 space-y-2 transition-colors",
                  v.isCurrent && "border-primary/50 bg-primary/5",
                )}
                data-testid={`row-schedule-version-${v.versionNumber}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1 flex items-start gap-2.5">
                    <SourceSystemIcon
                      fileType={v.fileType}
                      className="h-6 w-6 mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">v{v.versionNumber}</span>
                      {v.isCurrent && (
                        <Badge variant="default" className="text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Current
                        </Badge>
                      )}
                      {v.restoreOfVersionId && (
                        <Badge variant="secondary" className="text-xs">
                          <RotateCcw className="h-3 w-3 mr-1" /> Restored
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs uppercase">
                        {v.fileType}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm flex items-center gap-1.5 text-foreground">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate" title={v.fileName}>{v.fileName}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground space-x-3">
                      <span>{formatDateLabel(v.createdAt)}</span>
                      <span>·</span>
                      <span>{v.taskCount} tasks</span>
                      {v.importedByName && (
                        <>
                          <span>·</span>
                          <span>by {v.importedByName}</span>
                        </>
                      )}
                    </div>
                    {v.summary && (
                      <div className="mt-1 text-xs italic text-muted-foreground">
                        {v.summary}
                      </div>
                    )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onPreviewVersion?.(v);
                      onOpenChange(false);
                    }}
                    data-testid={`button-preview-version-${v.versionNumber}`}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const current = versions.find((x) => x.isCurrent);
                      setCompareFromId(v.id);
                      setCompareToId(current && current.id !== v.id ? current.id : (versions[0]?.id ?? null));
                    }}
                    data-testid={`button-compare-version-${v.versionNumber}`}
                  >
                    <GitCompare className="h-3.5 w-3.5 mr-1.5" /> Compare
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={v.isCurrent || restoreMutation.isPending}
                    onClick={() => setRestoreVersion(v)}
                    data-testid={`button-restore-version-${v.versionNumber}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Restore
                  </Button>
                  {v.fileUrl && (
                    <a
                      href={v.fileUrl}
                      download={v.fileName}
                      className="inline-flex items-center text-sm h-8 px-3 rounded-md border hover:bg-muted transition-colors"
                      data-testid={`button-download-version-${v.versionNumber}`}
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Compare / Diff Dialog */}
      <Dialog
        open={compareFromId != null}
        onOpenChange={(o) => {
          if (!o) {
            setCompareFromId(null);
            setCompareToId(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col" data-testid="dialog-compare-versions">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" /> Compare Schedule Versions
            </DialogTitle>
            <DialogDescription>
              See what tasks were added, removed, or changed between two versions.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-3 pb-2 border-b">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Select
                value={compareFromId?.toString() ?? ""}
                onValueChange={(v) => setCompareFromId(Number(v))}
              >
                <SelectTrigger data-testid="select-compare-from">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id.toString()}>
                      v{v.versionNumber} — {v.fileName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Select
                value={compareToId?.toString() ?? ""}
                onValueChange={(v) => setCompareToId(Number(v))}
              >
                <SelectTrigger data-testid="select-compare-to">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id.toString()}>
                      v{v.versionNumber} — {v.fileName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {compareFromId === compareToId && (
              <div className="text-sm text-muted-foreground py-12 text-center">
                Pick two different versions to compare.
              </div>
            )}
            {diffQuery.isLoading && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {diffQuery.data && (
              <Tabs defaultValue="changed" className="mt-3">
                <TabsList>
                  <TabsTrigger value="changed" data-testid="tab-diff-changed">
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Changed ({diffQuery.data.changed.length})
                  </TabsTrigger>
                  <TabsTrigger value="added" data-testid="tab-diff-added">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Added ({diffQuery.data.added.length})
                  </TabsTrigger>
                  <TabsTrigger value="removed" data-testid="tab-diff-removed">
                    <Minus className="h-3.5 w-3.5 mr-1.5" />
                    Removed ({diffQuery.data.removed.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="changed" className="mt-3">
                  <ScrollArea className="h-[50vh]">
                    {diffQuery.data.changed.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-4">
                        No tasks were modified between these versions.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {diffQuery.data.changed.map((entry) => (
                          <div key={snapshotKey(entry.after)} className="border rounded-lg p-3">
                            <div className="font-medium text-sm">
                              {entry.after.name}
                              {entry.after.wbs && (
                                <span className="ml-2 text-xs font-mono text-muted-foreground">
                                  {entry.after.wbs}
                                </span>
                              )}
                            </div>
                            <div className="mt-2 grid grid-cols-[120px_1fr_1fr] gap-2 text-xs text-muted-foreground pb-1 border-b">
                              <span>Field</span>
                              <span>Before</span>
                              <span>After</span>
                            </div>
                            <div className="mt-1">
                              {entry.changedFields.map((field) => (
                                <FieldDiffRow
                                  key={field}
                                  field={field}
                                  before={(entry.before as unknown as Record<string, unknown>)[field]}
                                  after={(entry.after as unknown as Record<string, unknown>)[field]}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="added" className="mt-3">
                  <ScrollArea className="h-[50vh]">
                    {diffQuery.data.added.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-4">No tasks added.</p>
                    ) : (
                      <div className="space-y-1">
                        {diffQuery.data.added.map((task) => (
                          <div
                            key={snapshotKey(task)}
                            className="text-sm py-1.5 px-2 border-b border-dashed flex items-center gap-2"
                          >
                            <Plus className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">{task.name}</span>
                            {task.wbs && (
                              <span className="ml-auto text-xs font-mono text-muted-foreground">
                                {task.wbs}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="removed" className="mt-3">
                  <ScrollArea className="h-[50vh]">
                    {diffQuery.data.removed.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-4">No tasks removed.</p>
                    ) : (
                      <div className="space-y-1">
                        {diffQuery.data.removed.map((task) => (
                          <div
                            key={snapshotKey(task)}
                            className="text-sm py-1.5 px-2 border-b border-dashed flex items-center gap-2"
                          >
                            <Minus className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                            <span className="truncate">{task.name}</span>
                            {task.wbs && (
                              <span className="ml-auto text-xs font-mono text-muted-foreground">
                                {task.wbs}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
            {diffQuery.data && (
              <div className="text-xs text-muted-foreground pt-3 border-t mt-3">
                {diffQuery.data.unchangedCount} unchanged tasks not shown.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation */}
      <AlertDialog
        open={restoreVersion != null}
        onOpenChange={(o) => !o && setRestoreVersion(null)}
      >
        <AlertDialogContent data-testid="dialog-restore-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore v{restoreVersion?.versionNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the project's current tasks with the snapshot from
              v{restoreVersion?.versionNumber}{" "}
              ({restoreVersion?.taskCount} tasks). The current tasks will be archived
              and a new version will be created so you can always restore again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreMutation.isPending}
              onClick={() => restoreVersion && restoreMutation.mutate(restoreVersion.id)}
              data-testid="button-confirm-restore"
            >
              {restoreMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
