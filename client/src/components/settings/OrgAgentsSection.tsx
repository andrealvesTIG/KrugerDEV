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
} from "lucide-react";
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
                      <TableRow key={a.id} data-testid={`row-org-agent-${a.id}`}>
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
    </div>
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
