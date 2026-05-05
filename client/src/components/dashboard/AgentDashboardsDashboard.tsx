import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Sparkles,
  BarChart3,
  ExternalLink,
  Pencil,
  Trash2,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { CustomDashboard as CustomDashboardType } from "@shared/schema";
import { CreateCustomDashboardDialog } from "./CreateCustomDashboardDialog";
import { AddPowerBIDialog } from "./AddPowerBIDialog";

interface AgentDashboardsDashboardProps {
  onOpenDashboard: (dashboardId: number) => void;
}

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function isPowerBIDashboard(d: CustomDashboardType): boolean {
  const widgets = d.config?.widgets;
  if (!Array.isArray(widgets)) return false;
  return widgets.some((w) => w?.type === "powerbi-embed");
}

export function AgentDashboardsDashboard({
  onOpenDashboard,
}: AgentDashboardsDashboardProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showPowerBI, setShowPowerBI] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CustomDashboardType | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CustomDashboardType | null>(
    null,
  );

  const dashboardsKey = `/api/custom-dashboards?organizationId=${orgId}`;

  const { data: dashboards = [], isLoading } = useQuery<CustomDashboardType[]>({
    queryKey: [dashboardsKey],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(dashboardsKey, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load dashboards");
      return res.json();
    },
    enabled: !!orgId,
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await apiRequest("PATCH", `/api/custom-dashboards/${id}`, {
        name,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [dashboardsKey] });
      toast({ title: "Dashboard renamed" });
      setRenameTarget(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't rename dashboard",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/custom-dashboards/${id}`);
    },
    onSuccess: (_, id) => {
      queryClient.setQueryData<CustomDashboardType[]>(
        [dashboardsKey],
        (prev) => (prev ? prev.filter((d) => d.id !== id) : prev),
      );
      toast({ title: "Dashboard deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't delete dashboard",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dashboards;
    return dashboards.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q),
    );
  }, [dashboards, search]);

  const startRename = (d: CustomDashboardType) => {
    setRenameTarget(d);
    setRenameValue(d.name);
  };

  const handleCreated = (dashboardId: number) => {
    queryClient.invalidateQueries({ queryKey: [dashboardsKey] });
    onOpenDashboard(dashboardId);
  };

  return (
    <div className="space-y-4" data-testid="agent-dashboards-dashboard">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Agent Dashboards</h2>
          <p className="text-sm text-muted-foreground">
            Custom dashboards generated with AI or embedded from Power BI.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dashboards…"
              className="pl-8"
              data-testid="input-agent-dashboards-search"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowCreate(true)}
            data-testid="button-generate-with-ai"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Generate with AI
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPowerBI(true)}
            data-testid="button-add-powerbi"
          >
            <BarChart3 className="h-4 w-4 mr-1 text-amber-500" />
            Add Power BI
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : dashboards.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="text-base font-medium">No custom dashboards yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Generate a dashboard with AI from a natural-language prompt, or
              embed an existing Power BI report.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                type="button"
                size="sm"
                onClick={() => setShowCreate(true)}
                data-testid="button-empty-generate-with-ai"
              >
                <Plus className="h-4 w-4 mr-1" />
                Generate with AI
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPowerBI(true)}
                data-testid="button-empty-add-powerbi"
              >
                <BarChart3 className="h-4 w-4 mr-1 text-amber-500" />
                Add Power BI
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No dashboards match “{search}”.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {filtered.map((d) => {
            const isPbi = isPowerBIDashboard(d);
            return (
              <div
                key={d.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40"
                data-testid={`agent-dashboard-row-${d.id}`}
              >
                {isPbi ? (
                  <BarChart3 className="h-4 w-4 mt-1 text-amber-500 shrink-0" />
                ) : (
                  <Sparkles className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className="text-sm font-medium text-left hover:underline truncate"
                      onClick={() => onOpenDashboard(d.id)}
                      data-testid={`agent-dashboard-name-${d.id}`}
                    >
                      {d.name}
                    </button>
                    <Badge
                      variant="secondary"
                      className="text-[10px] uppercase tracking-wide"
                      data-testid={`agent-dashboard-source-${d.id}`}
                    >
                      {isPbi ? "Power BI" : "AI"}
                    </Badge>
                  </div>
                  {d.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {d.description}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground/80 mt-1">
                    Updated {formatDate(d.updatedAt ?? d.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenDashboard(d.id)}
                    data-testid={`agent-dashboard-open-${d.id}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Open</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => startRename(d)}
                    data-testid={`agent-dashboard-rename-${d.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Rename</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(d)}
                    data-testid={`agent-dashboard-delete-${d.id}`}
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

      <CreateCustomDashboardDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={handleCreated}
      />

      <AddPowerBIDialog
        open={showPowerBI}
        onOpenChange={setShowPowerBI}
        onCreated={handleCreated}
      />

      <Dialog
        open={!!renameTarget}
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          data-testid="dialog-rename-dashboard"
        >
          <DialogHeader>
            <DialogTitle>Rename dashboard</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rename-dashboard-input">Name</Label>
            <Input
              id="rename-dashboard-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              data-testid="input-rename-dashboard"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameTarget(null)}
              data-testid="button-cancel-rename-dashboard"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const trimmed = renameValue.trim();
                if (!renameTarget || !trimmed || trimmed === renameTarget.name) {
                  setRenameTarget(null);
                  return;
                }
                renameMutation.mutate({ id: renameTarget.id, name: trimmed });
              }}
              disabled={renameMutation.isPending}
              data-testid="button-confirm-rename-dashboard"
            >
              {renameMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-delete-dashboard">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name
                ? `"${deleteTarget.name}" will be permanently removed.`
                : "This dashboard will be permanently removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-dashboard">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
              data-testid="button-confirm-delete-dashboard"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
