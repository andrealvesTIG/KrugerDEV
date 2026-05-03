import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Bot, Sparkles, BrainCircuit, Bookmark, ClipboardList, FileText, BarChart3,
  Calendar, Users, Mail, Wand2, Rocket, ShieldCheck, Lightbulb, Zap,
  Pencil, Copy, Trash2, Archive as ArchiveIcon, Loader2, MoreVertical, UserCog, Eye, EyeOff,
  CheckCircle2, XCircle, ChevronDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

type IconComponent = typeof Bot;
const ICON_MAP: Record<string, IconComponent> = {
  Bot, Sparkles, BrainCircuit, Bookmark, ClipboardList, FileText, BarChart3,
  Calendar, Users, Mail, Wand2, Rocket, ShieldCheck, Lightbulb, Zap,
};

interface AdminAgent {
  id: number;
  organizationId: number;
  createdBy: string;
  type: "chat" | "scheduled";
  name: string;
  description: string | null;
  icon: string | null;
  visibility: "private" | "org" | "members";
  enabled: boolean;
  updatedAt: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
}

interface OrgMember {
  userId: string; role: string;
  firstName: string | null; lastName: string | null; email: string | null;
}

type BulkActionKind = "enable" | "disable" | "visibility-private" | "visibility-org" | "archive" | "delete";

interface BulkConfirm {
  kind: BulkActionKind;
  title: string;
  description: string;
  destructive?: boolean;
}

interface BulkResultRow {
  id: number;
  name: string;
  ok: boolean;
  error?: string;
}

interface BulkProgress {
  label: string;
  total: number;
  done: number;
  results: BulkResultRow[];
  finished: boolean;
}

const visibilityLabel = (v: AdminAgent["visibility"]) =>
  v === "org" ? "Shared with org" : v === "members" ? "Shared with members" : "Private";

export function OrgAgentsSection({ organizationId }: { organizationId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "chat" | "scheduled">("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "private" | "org" | "members">("all");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [reassignTarget, setReassignTarget] = useState<AdminAgent | null>(null);
  const [memberPickerTarget, setMemberPickerTarget] = useState<AdminAgent | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<BulkConfirm | null>(null);
  const [bulkReassignOpen, setBulkReassignOpen] = useState(false);
  const [bulkMembersOpen, setBulkMembersOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);

  const { data: agents = [], isLoading } = useQuery<AdminAgent[]>({
    queryKey: ["/api/agents/admin/list", organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/admin/list?organizationId=${organizationId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load agents");
      return res.json();
    },
  });

  const { data: orgMembers = [] } = useQuery<OrgMember[]>({
    queryKey: ["/api/agents/_helpers/org-members", organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/_helpers/org-members?organizationId=${organizationId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const memberLabel = (uid: string) => {
    const m = orgMembers.find(x => x.userId === uid);
    if (!m) return uid;
    return `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email || uid;
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/agents/admin/list", organizationId] });
    qc.invalidateQueries({ queryKey: ["/api/agents", organizationId, "picker"] });
  };

  const patchAgent = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<AdminAgent> & { memberIds?: string[] } }) => {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ organizationId, ...patch }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Update failed");
      }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Agent updated" }); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const reassign = useMutation({
    mutationFn: async ({ id, newOwnerId }: { id: number; newOwnerId: string }) => {
      const res = await fetch(`/api/agents/${id}/reassign-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ organizationId, newOwnerId }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Reassign failed");
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Owner reassigned" }); setReassignTarget(null); },
    onError: (e: Error) => toast({ title: "Reassign failed", description: e.message, variant: "destructive" }),
  });

  const duplicate = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/agents/${id}/duplicate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ organizationId }),
      });
      if (!res.ok) throw new Error("Duplicate failed");
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Agent duplicated" }); },
    onError: () => toast({ title: "Duplicate failed", variant: "destructive" }),
  });

  const archive = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/agents/${id}/archive`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ organizationId }),
      });
      if (!res.ok) throw new Error("Archive failed");
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Agent archived" }); },
    onError: () => toast({ title: "Archive failed", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/agents/${id}?organizationId=${organizationId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Agent deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const runBulk = async (
    label: string,
    ids: number[],
    runOne: (a: AdminAgent) => Promise<void>,
  ) => {
    const targets = agents.filter(a => ids.includes(a.id));
    setBulkProgress({ label, total: targets.length, done: 0, results: [], finished: false });
    const results: BulkResultRow[] = [];
    for (const a of targets) {
      try {
        await runOne(a);
        results.push({ id: a.id, name: a.name, ok: true });
      } catch (e) {
        results.push({ id: a.id, name: a.name, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      setBulkProgress({ label, total: targets.length, done: results.length, results: [...results], finished: false });
    }
    setBulkProgress({ label, total: targets.length, done: results.length, results, finished: true });
    invalidateAll();
    const okCount = results.filter(r => r.ok).length;
    const failCount = results.length - okCount;
    toast({
      title: `${label} complete`,
      description: `${okCount} succeeded${failCount ? `, ${failCount} failed` : ""}.`,
      variant: failCount ? "destructive" : undefined,
    });
    setSelectedIds(new Set(failCount ? results.filter(r => !r.ok).map(r => r.id) : []));
  };

  const patchOne = async (id: number, body: Record<string, unknown>) => {
    const res = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ organizationId, ...body }),
    });
    if (!res.ok) throw new Error((await res.text()) || "Update failed");
  };
  const archiveOne = async (id: number) => {
    const res = await fetch(`/api/agents/${id}/archive`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ organizationId }),
    });
    if (!res.ok) throw new Error((await res.text()) || "Archive failed");
  };
  const deleteOne = async (id: number) => {
    const res = await fetch(`/api/agents/${id}?organizationId=${organizationId}`, {
      method: "DELETE", credentials: "include",
    });
    if (!res.ok) throw new Error((await res.text()) || "Delete failed");
  };
  const reassignOne = async (id: number, newOwnerId: string) => {
    const res = await fetch(`/api/agents/${id}/reassign-owner`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ organizationId, newOwnerId }),
    });
    if (!res.ok) throw new Error((await res.text()) || "Reassign failed");
  };

  const executeBulkConfirm = async () => {
    if (!bulkConfirm) return;
    const ids = Array.from(selectedIds);
    const kind = bulkConfirm.kind;
    setBulkConfirm(null);
    if (kind === "enable") {
      await runBulk("Enable", ids, (a) => patchOne(a.id, { enabled: true }));
    } else if (kind === "disable") {
      await runBulk("Disable", ids, (a) => patchOne(a.id, { enabled: false }));
    } else if (kind === "visibility-private") {
      await runBulk("Set visibility to Private", ids, (a) => patchOne(a.id, { visibility: "private", memberIds: [] }));
    } else if (kind === "visibility-org") {
      await runBulk("Set visibility to Shared with org", ids, (a) => patchOne(a.id, { visibility: "org", memberIds: [] }));
    } else if (kind === "archive") {
      await runBulk("Archive", ids, (a) => archiveOne(a.id));
    } else if (kind === "delete") {
      await runBulk("Delete", ids, (a) => deleteOne(a.id));
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter(a => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (visibilityFilter !== "all" && a.visibility !== visibilityFilter) return false;
      if (enabledFilter === "enabled" && !a.enabled) return false;
      if (enabledFilter === "disabled" && a.enabled) return false;
      if (!q) return true;
      const owner = (a.createdByName || a.createdByEmail || "").toLowerCase();
      return a.name.toLowerCase().includes(q) || owner.includes(q) || (a.description || "").toLowerCase().includes(q);
    });
  }, [agents, search, typeFilter, visibilityFilter, enabledFilter]);

  const counts = useMemo(() => {
    const total = agents.length;
    const chat = agents.filter(a => a.type === "chat").length;
    const scheduled = agents.filter(a => a.type === "scheduled").length;
    const shared = agents.filter(a => a.visibility !== "private").length;
    const priv = agents.filter(a => a.visibility === "private").length;
    const disabled = agents.filter(a => !a.enabled).length;
    return { total, chat, scheduled, shared, priv, disabled };
  }, [agents]);

  const openEdit = (a: AdminAgent) => {
    window.location.href = `/agents?edit=${a.id}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle>Custom Agents</CardTitle>
          </div>
          <CardDescription>
            Govern every custom AI agent in your organization. Built-in agents (Friday, Power BI, Project Agent) are
            managed separately and aren't listed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <SummaryStat label="Total" value={counts.total} />
            <SummaryStat label="Chat" value={counts.chat} />
            <SummaryStat label="Scheduled" value={counts.scheduled} />
            <SummaryStat label="Shared" value={counts.shared} sub={`${counts.priv} private`} />
            <SummaryStat label="Disabled" value={counts.disabled} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search by name, owner or description"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs"
              data-testid="input-org-agents-search"
            />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-[140px]" data-testid="select-org-agents-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={visibilityFilter} onValueChange={(v) => setVisibilityFilter(v as typeof visibilityFilter)}>
              <SelectTrigger className="w-[180px]" data-testid="select-org-agents-visibility"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All visibility</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="org">Shared with org</SelectItem>
                <SelectItem value="members">Shared with members</SelectItem>
              </SelectContent>
            </Select>
            <Select value={enabledFilter} onValueChange={(v) => setEnabledFilter(v as typeof enabledFilter)}>
              <SelectTrigger className="w-[140px]" data-testid="select-org-agents-enabled"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedIds.size > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2"
              data-testid="bulk-actions-bar"
            >
              <span className="text-sm font-medium" data-testid="text-bulk-selected-count">
                {selectedIds.size} selected
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} data-testid="button-bulk-clear">
                Clear
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline" size="sm"
                onClick={() => setBulkConfirm({ kind: "enable", title: "Enable agents", description: `Enable ${selectedIds.size} selected agent${selectedIds.size === 1 ? "" : "s"}?` })}
                data-testid="button-bulk-enable"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Enable
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => setBulkConfirm({ kind: "disable", title: "Disable agents", description: `Disable ${selectedIds.size} selected agent${selectedIds.size === 1 ? "" : "s"}? Members won't be able to use them until re-enabled.` })}
                data-testid="button-bulk-disable"
              >
                <XCircle className="h-4 w-4 mr-1" /> Disable
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-bulk-visibility">
                    <Eye className="h-4 w-4 mr-1" /> Change visibility <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onSelect={() => setBulkConfirm({ kind: "visibility-private", title: "Make private", description: `Make ${selectedIds.size} agent${selectedIds.size === 1 ? "" : "s"} private? Other members will lose access.` })}
                    data-testid="menu-bulk-visibility-private"
                  >
                    <EyeOff className="h-4 w-4 mr-2" /> Private
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setBulkConfirm({ kind: "visibility-org", title: "Share with org", description: `Share ${selectedIds.size} agent${selectedIds.size === 1 ? "" : "s"} with everyone in the organization?` })}
                    data-testid="menu-bulk-visibility-org"
                  >
                    <Eye className="h-4 w-4 mr-2" /> Shared with org
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setBulkMembersOpen(true)} data-testid="menu-bulk-visibility-members">
                    <Users className="h-4 w-4 mr-2" /> Shared with members…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" onClick={() => setBulkReassignOpen(true)} data-testid="button-bulk-reassign">
                <UserCog className="h-4 w-4 mr-1" /> Reassign owner…
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => setBulkConfirm({ kind: "archive", title: "Archive agents", description: `Archive ${selectedIds.size} agent${selectedIds.size === 1 ? "" : "s"}? They'll be hidden from members but can be restored later.` })}
                data-testid="button-bulk-archive"
              >
                <ArchiveIcon className="h-4 w-4 mr-1" /> Archive
              </Button>
              <Button
                variant="destructive" size="sm"
                onClick={() => setBulkConfirm({ kind: "delete", title: "Delete agents", description: `Permanently delete ${selectedIds.size} agent${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`, destructive: true })}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </div>
          )}

          {agents.length === 0 ? (
            <div className="border rounded-lg p-10 text-center space-y-3">
              <Bot className="h-10 w-10 text-muted-foreground mx-auto" />
              <div className="text-sm text-muted-foreground">
                No custom agents have been created in this organization yet.
              </div>
              <Button asChild data-testid="button-create-first-agent">
                <a href="/agents?new=1">Create an agent</a>
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No agents match the current filters.</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={
                          filtered.length > 0 && filtered.every(a => selectedIds.has(a.id))
                            ? true
                            : filtered.some(a => selectedIds.has(a.id))
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={(v) => {
                          const next = new Set(selectedIds);
                          if (v) filtered.forEach(a => next.add(a.id));
                          else filtered.forEach(a => next.delete(a.id));
                          setSelectedIds(next);
                        }}
                        aria-label="Select all on page"
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="w-[110px]">Type</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="w-[180px]">Visibility</TableHead>
                    <TableHead className="w-[110px] text-center">Enabled</TableHead>
                    <TableHead className="w-[160px]">Last updated</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(a => {
                    const Icon = ICON_MAP[a.icon || "Bot"] ?? Bot;
                    return (
                      <TableRow key={a.id} data-testid={`row-org-agent-${a.id}`} data-state={selectedIds.has(a.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(a.id)}
                            onCheckedChange={(v) => {
                              const next = new Set(selectedIds);
                              if (v) next.add(a.id); else next.delete(a.id);
                              setSelectedIds(next);
                            }}
                            aria-label={`Select ${a.name}`}
                            data-testid={`checkbox-row-${a.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2 min-w-0">
                            <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="font-medium truncate">{a.name}</div>
                              {a.description && (
                                <div className="text-xs text-muted-foreground line-clamp-2">{a.description}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">{a.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{a.createdByName || "—"}</div>
                          {a.createdByEmail && a.createdByName !== a.createdByEmail && (
                            <div className="text-xs text-muted-foreground">{a.createdByEmail}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full justify-start" data-testid={`button-visibility-${a.id}`}>
                                {visibilityLabel(a.visibility)}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuLabel>Change visibility</DropdownMenuLabel>
                              <DropdownMenuItem onSelect={() => patchAgent.mutate({ id: a.id, patch: { visibility: "private", memberIds: [] } })}>
                                <EyeOff className="h-4 w-4 mr-2" /> Private
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => patchAgent.mutate({ id: a.id, patch: { visibility: "org", memberIds: [] } })}>
                                <Eye className="h-4 w-4 mr-2" /> Shared with org
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setMemberPickerTarget(a)}>
                                <Users className="h-4 w-4 mr-2" /> Shared with members…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={a.enabled}
                            onCheckedChange={(v) => patchAgent.mutate({ id: a.id, patch: { enabled: v } })}
                            data-testid={`switch-enabled-${a.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {a.updatedAt ? new Date(a.updatedAt).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-row-actions-${a.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openEdit(a)} data-testid={`menu-edit-${a.id}`}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => duplicate.mutate(a.id)}>
                                <Copy className="h-4 w-4 mr-2" /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setReassignTarget(a)} data-testid={`menu-reassign-${a.id}`}>
                                <UserCog className="h-4 w-4 mr-2" /> Reassign owner…
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => { if (confirm(`Archive "${a.name}"?`)) archive.mutate(a.id); }}>
                                <ArchiveIcon className="h-4 w-4 mr-2" /> Archive
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => { if (confirm(`Delete "${a.name}"? This cannot be undone.`)) remove.mutate(a.id); }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {reassignTarget && (
        <ReassignOwnerDialog
          agent={reassignTarget}
          members={orgMembers}
          memberLabel={memberLabel}
          onClose={() => setReassignTarget(null)}
          onSubmit={(newOwnerId) => reassign.mutate({ id: reassignTarget.id, newOwnerId })}
          submitting={reassign.isPending}
        />
      )}

      {memberPickerTarget && (
        <MemberPickerDialog
          agent={memberPickerTarget}
          members={orgMembers}
          organizationId={organizationId}
          onClose={() => setMemberPickerTarget(null)}
          onSubmit={(memberIds) => {
            patchAgent.mutate(
              { id: memberPickerTarget.id, patch: { visibility: "members", memberIds } },
              { onSuccess: () => setMemberPickerTarget(null) },
            );
          }}
          submitting={patchAgent.isPending}
        />
      )}

      {bulkConfirm && (
        <Dialog open onOpenChange={(o) => { if (!o) setBulkConfirm(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{bulkConfirm.title}</DialogTitle>
              <DialogDescription>{bulkConfirm.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setBulkConfirm(null)}>Cancel</Button>
              <Button
                variant={bulkConfirm.destructive ? "destructive" : "default"}
                onClick={() => { void executeBulkConfirm(); }}
                data-testid="button-bulk-confirm"
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {bulkReassignOpen && (
        <BulkReassignDialog
          count={selectedIds.size}
          members={orgMembers}
          memberLabel={memberLabel}
          onClose={() => setBulkReassignOpen(false)}
          onSubmit={async (newOwnerId) => {
            setBulkReassignOpen(false);
            await runBulk("Reassign owner", Array.from(selectedIds), (a) => reassignOne(a.id, newOwnerId));
          }}
        />
      )}

      {bulkMembersOpen && (
        <BulkMembersDialog
          count={selectedIds.size}
          members={orgMembers}
          onClose={() => setBulkMembersOpen(false)}
          onSubmit={async (memberIds) => {
            setBulkMembersOpen(false);
            await runBulk(
              "Share with members",
              Array.from(selectedIds),
              (a) => patchOne(a.id, { visibility: "members", memberIds }),
            );
          }}
        />
      )}

      {bulkProgress && (
        <Dialog open onOpenChange={(o) => { if (!o && bulkProgress.finished) setBulkProgress(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{bulkProgress.label}</DialogTitle>
              <DialogDescription>
                {bulkProgress.finished
                  ? `Finished. ${bulkProgress.results.filter(r => r.ok).length} succeeded, ${bulkProgress.results.filter(r => !r.ok).length} failed.`
                  : `Processing ${bulkProgress.done} of ${bulkProgress.total}…`}
              </DialogDescription>
            </DialogHeader>
            <div className="border rounded max-h-72 overflow-y-auto divide-y" data-testid="bulk-results-list">
              {bulkProgress.results.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Working…
                </div>
              ) : bulkProgress.results.map(r => (
                <div key={r.id} className="flex items-start gap-2 p-2 text-sm" data-testid={`bulk-result-${r.id}`}>
                  {r.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    {!r.ok && r.error && (
                      <div className="text-xs text-destructive truncate">{r.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button
                onClick={() => setBulkProgress(null)}
                disabled={!bulkProgress.finished}
                data-testid="button-bulk-progress-close"
              >
                {bulkProgress.finished ? "Close" : <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Working…</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function BulkReassignDialog({
  count, members, memberLabel, onClose, onSubmit,
}: {
  count: number;
  members: OrgMember[];
  memberLabel: (uid: string) => string;
  onClose: () => void;
  onSubmit: (newOwnerId: string) => void;
}) {
  const [pick, setPick] = useState<string>("");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign owner</DialogTitle>
          <DialogDescription>
            Choose a new owner for {count} selected agent{count === 1 ? "" : "s"}. The previous owners
            will lose owner-only edit rights, but each agent's configuration is preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label>New owner</Label>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="mt-1.5" data-testid="select-bulk-new-owner"><SelectValue placeholder="Choose a member…" /></SelectTrigger>
            <SelectContent>
              {members.map(m => (
                <SelectItem key={m.userId} value={m.userId} data-testid={`option-bulk-owner-${m.userId}`}>
                  {memberLabel(m.userId)} <span className="text-xs text-muted-foreground ml-1">({m.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => pick && onSubmit(pick)} disabled={!pick} data-testid="button-confirm-bulk-reassign">
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkMembersDialog({
  count, members, onClose, onSubmit,
}: {
  count: number;
  members: OrgMember[];
  onClose: () => void;
  onSubmit: (memberIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (uid: string) => {
    const cur = new Set(selected);
    if (cur.has(uid)) cur.delete(uid); else cur.add(uid);
    setSelected(Array.from(cur));
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share with members</DialogTitle>
          <DialogDescription>
            Select which members can use the {count} selected agent{count === 1 ? "" : "s"}.
            Existing per-agent member lists will be replaced.
          </DialogDescription>
        </DialogHeader>
        <div className="border rounded p-2 max-h-72 overflow-y-auto space-y-1">
          {members.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2">No org members found.</div>
          ) : members.map(m => {
            const label = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email || m.userId;
            const checked = selected.includes(m.userId);
            return (
              <label key={m.userId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(m.userId)}
                  data-testid={`checkbox-bulk-share-${m.userId}`}
                />
                <span className="truncate">{label}</span>
                <span className="text-xs text-muted-foreground">({m.role})</span>
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit(selected)} data-testid="button-confirm-bulk-share">
            Apply to {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function ReassignOwnerDialog({
  agent, members, memberLabel, onClose, onSubmit, submitting,
}: {
  agent: AdminAgent;
  members: OrgMember[];
  memberLabel: (uid: string) => string;
  onClose: () => void;
  onSubmit: (newOwnerId: string) => void;
  submitting: boolean;
}) {
  const [pick, setPick] = useState<string>("");
  const eligible = members.filter(m => m.userId !== agent.createdBy);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign owner</DialogTitle>
          <DialogDescription>
            Choose a new owner for <strong>{agent.name}</strong>. The current owner ({memberLabel(agent.createdBy)})
            will lose owner-only edit rights, but the agent's configuration is preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label>New owner</Label>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="mt-1.5" data-testid="select-new-owner"><SelectValue placeholder="Choose a member…" /></SelectTrigger>
            <SelectContent>
              {eligible.map(m => (
                <SelectItem key={m.userId} value={m.userId} data-testid={`option-owner-${m.userId}`}>
                  {memberLabel(m.userId)} <span className="text-xs text-muted-foreground ml-1">({m.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => pick && onSubmit(pick)} disabled={!pick || submitting} data-testid="button-confirm-reassign">
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberPickerDialog({
  agent, members, organizationId, onClose, onSubmit, submitting,
}: {
  agent: AdminAgent;
  members: OrgMember[];
  organizationId: number;
  onClose: () => void;
  onSubmit: (memberIds: string[]) => void;
  submitting: boolean;
}) {
  const { data: existing } = useQuery<{ memberIds?: string[] }>({
    queryKey: ["/api/agents", agent.id, "detail", organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agent.id}?organizationId=${organizationId}`, { credentials: "include" });
      return res.ok ? res.json() : {};
    },
  });
  const [selected, setSelected] = useState<string[] | null>(null);
  const ids = selected ?? (existing?.memberIds ?? []);
  const toggle = (uid: string) => {
    const cur = new Set(ids);
    if (cur.has(uid)) cur.delete(uid); else cur.add(uid);
    setSelected(Array.from(cur));
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share with members</DialogTitle>
          <DialogDescription>
            Select which members of the organization can use <strong>{agent.name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="border rounded p-2 max-h-72 overflow-y-auto space-y-1">
          {members.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2">No org members found.</div>
          ) : members.map(m => {
            const label = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email || m.userId;
            const checked = ids.includes(m.userId);
            return (
              <label key={m.userId} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={checked} onChange={() => toggle(m.userId)} data-testid={`checkbox-share-${m.userId}`} />
                <span className="truncate">{label}</span>
                <span className="text-xs text-muted-foreground">({m.role})</span>
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit(ids)} disabled={submitting} data-testid="button-confirm-share">
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
