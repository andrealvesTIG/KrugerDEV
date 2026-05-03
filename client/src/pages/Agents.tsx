import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bot, Sparkles, BrainCircuit, Bookmark, ClipboardList, FileText, BarChart3,
  Calendar, Users, Mail, Wand2, Rocket, ShieldCheck, Lightbulb, Zap,
  Plus, Trash2, Play, History, Pencil, Copy, MoreVertical, Loader2, Archive as ArchiveIcon,
} from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

const ICON_MAP: Record<string, any> = {
  Bot, Sparkles, BrainCircuit, Bookmark, ClipboardList, FileText, BarChart3,
  Calendar, Users, Mail, Wand2, Rocket, ShieldCheck, Lightbulb, Zap,
};
const ICON_OPTIONS = Object.keys(ICON_MAP);
const FALLBACK_MODELS = [
  { id: "gpt-4o-mini", label: "gpt-4o-mini" },
  { id: "gpt-4o", label: "gpt-4o" },
];
const CHAT_TOOLS = [
  "create_task",
  "create_mitigation",
  "assign_owner",
  "add_note",
  "flag_for_review",
] as const;
const SCHEDULED_TOOLS = ["send_email"] as const;
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

interface Agent {
  id: number; organizationId: number; createdBy: string;
  type: "chat" | "scheduled"; name: string; description: string | null;
  icon: string | null; systemPrompt: string; model: string;
  dataScope: { type: "org"|"portfolios"|"projects"; portfolioIds?: number[]; projectIds?: number[] };
  allowedTools: string[]; visibility: "private"|"org"|"members";
  enabled: boolean; scheduleDay: number | null; scheduleTime: string | null;
  timezone: string | null; recipientEmails: string[] | null; emailSubject: string | null;
  lastRun: string | null; nextRun: string | null;
  isOwner: boolean; isAdmin: boolean;
  createdByName?: string | null;
  kind?: "custom" | "builtin";
  category?: "mine" | "shared" | "builtin";
  href?: string | null;
}
interface ModelOption { id: string; label: string; source: "platform" | "org-azure" }

interface Project { id: number; name: string; portfolioId: number | null }
interface Portfolio { id: number; name: string }
interface OrgMember { userId: string; role: string; firstName: string | null; lastName: string | null; email: string | null }

const DEFAULT_DRAFT = (orgId: number): Partial<Agent> & { memberIds: string[] } => ({
  organizationId: orgId,
  type: "chat", name: "", description: "", icon: "Bot",
  systemPrompt: "You are a helpful assistant inside FridayReport.AI. Be concise and reference specific projects when relevant.",
  model: "gpt-4o-mini",
  dataScope: { type: "org" },
  allowedTools: [],
  visibility: "private",
  enabled: true,
  scheduleDay: 1, scheduleTime: "09:00", timezone: "America/New_York",
  recipientEmails: [], emailSubject: "",
  memberIds: [],
});

export default function AgentsPage() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Partial<Agent> & { memberIds: string[] }) | null>(null);
  const [logsForAgent, setLogsForAgent] = useState<Agent | null>(null);

  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents", orgId, "picker"],
    queryFn: async () => {
      const res = await fetch(`/api/agents?organizationId=${orgId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load agents");
      return res.json();
    },
    enabled: !!orgId,
  });

  const { data: portfolios = [] } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/portfolios?organizationId=${orgId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    }, enabled: !!orgId,
  });
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/projects?organizationId=${orgId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    }, enabled: !!orgId,
  });
  const { data: orgMembers = [] } = useQuery<OrgMember[]>({
    queryKey: ["/api/agents/_helpers/org-members", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/_helpers/org-members?organizationId=${orgId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    }, enabled: !!orgId,
  });
  const { data: modelOptions = FALLBACK_MODELS as ModelOption[] } = useQuery<ModelOption[]>({
    queryKey: ["/api/agents/_helpers/models", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/_helpers/models?organizationId=${orgId}`, { credentials: "include" });
      return res.ok ? res.json() : FALLBACK_MODELS;
    }, enabled: !!orgId,
  });

  const saveMutation = useMutation({
    mutationFn: async (draft: Partial<Agent> & { memberIds: string[] }) => {
      const isUpdate = !!draft.id;
      const url = isUpdate ? `/api/agents/${draft.id}` : `/api/agents`;
      const res = await fetch(url, {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      const text = await res.text();
      const looksLikeHtml = text.trim().startsWith("<");
      if (looksLikeHtml) {
        throw new Error("The server is reloading. Please try again in a moment.");
      }
      let payload: any = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { /* leave empty */ }
      if (!res.ok) throw new Error(payload.message || `Save failed (${res.status})`);
      return payload;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents", orgId, "picker"] });
      toast({ title: "Agent saved" });
      setEditing(null);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/agents/${id}?organizationId=${orgId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agents", orgId, "picker"] }); toast({ title: "Agent deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const runMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/agents/${id}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) throw new Error("Run failed");
      return res.json();
    },
    onSuccess: (r: any) => toast({ title: r.status === "success" ? "Report sent" : `Run ${r.status}`, description: r.message }),
    onError: (e: any) => toast({ title: "Run failed", description: e.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/agents/${id}/duplicate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) throw new Error("Duplicate failed");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agents", orgId, "picker"] }); toast({ title: "Agent duplicated" }); },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/agents/${id}/archive`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) throw new Error("Archive failed");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agents", orgId, "picker"] }); toast({ title: "Agent archived" }); },
    onError: (e: any) => toast({ title: "Archive failed", description: e.message, variant: "destructive" }),
  });

  const builtinAgents = useMemo(() => agents.filter(a => a.kind === "builtin"), [agents]);
  const customAgents = useMemo(() => agents.filter(a => a.kind !== "builtin"), [agents]);
  const myAgents = useMemo(() => customAgents.filter(a => a.category === "mine" || a.isOwner), [customAgents]);
  const sharedAgents = useMemo(() => customAgents.filter(a => !(a.category === "mine" || a.isOwner)), [customAgents]);

  const startCreate = () => orgId && setEditing(DEFAULT_DRAFT(orgId));

  useEffect(() => {
    if (!orgId) return;
    let flagged = false;
    try {
      flagged = sessionStorage.getItem("agents:openNew") === "1";
      if (flagged) sessionStorage.removeItem("agents:openNew");
    } catch {}
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("new") === "1";
    const editId = Number(params.get("edit") || "");
    if (Number.isFinite(editId) && editId > 0 && !editing) {
      // Org Settings → Agents tab links here with ?edit=<id> to open the
      // existing edit form. Fetch the full agent (admins can edit any agent
      // in their org) and seed the editor.
      fetch(`/api/agents/${editId}?organizationId=${orgId}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(full => {
          if (!full) return;
          setEditing({ ...full, memberIds: full.memberIds ?? [] });
        })
        .finally(() => {
          params.delete("edit");
          const qs = params.toString();
          const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
          window.history.replaceState(window.history.state, "", newUrl);
        });
      return;
    }
    if ((flagged || fromUrl) && !editing) {
      setEditing(DEFAULT_DRAFT(orgId));
      if (fromUrl) {
        params.delete("new");
        const qs = params.toString();
        const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
        window.history.replaceState(window.history.state, "", newUrl);
      }
    }
  }, [orgId, editing]);
  const startEdit = (a: Agent) => {
    if (!a.isOwner && !a.isAdmin) return;
    setEditing({ ...a, memberIds: [] });
    // Fetch members
    fetch(`/api/agents/${a.id}?organizationId=${orgId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(full => full && setEditing(prev => prev ? { ...prev, memberIds: full.memberIds ?? [] } : prev));
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">Create chat and scheduled AI agents tailored to your workflows.</p>
        </div>
        <Button onClick={startCreate} data-testid="button-create-agent">
          <Plus className="h-4 w-4 mr-1" /> New agent
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      )}

      <AgentSection title="My agents" emptyText="You haven't created any custom agents yet. Click New agent to start.">
        {myAgents.map(a => (
          <CustomAgentCard
            key={a.id} a={a}
            onEdit={() => startEdit(a)}
            onDuplicate={() => duplicateMutation.mutate(a.id)}
            onRun={() => runMutation.mutate(a.id)}
            onLogs={() => setLogsForAgent(a)}
            onArchive={() => { if (confirm(`Archive "${a.name}"?`)) archiveMutation.mutate(a.id); }}
            onDelete={() => { if (confirm(`Delete "${a.name}"?`)) deleteMutation.mutate(a.id); }}
          />
        ))}
      </AgentSection>

      <AgentSection title="Shared with me" emptyText="No custom agents have been shared with you.">
        {sharedAgents.map(a => (
          <CustomAgentCard
            key={a.id} a={a}
            onEdit={() => startEdit(a)}
            onDuplicate={() => duplicateMutation.mutate(a.id)}
            onRun={() => runMutation.mutate(a.id)}
            onLogs={() => setLogsForAgent(a)}
            onArchive={() => { if (confirm(`Archive "${a.name}"?`)) archiveMutation.mutate(a.id); }}
            onDelete={() => { if (confirm(`Delete "${a.name}"?`)) deleteMutation.mutate(a.id); }}
          />
        ))}
      </AgentSection>

      <Card>
        <CardHeader><CardTitle className="text-base">Built-in</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {builtinAgents.length > 0 ? builtinAgents.map(b => {
            const Icon = ICON_MAP[b.icon || "Bot"] ?? Bot;
            return <BuiltinCard key={b.id} icon={Icon} name={b.name} desc={b.description ?? ""} href={b.href ?? undefined} />;
          }) : (
            <>
              <BuiltinCard icon={Sparkles} name="Friday" desc="Default chat agent across the app." />
              <BuiltinCard icon={BarChart3} name="Power BI Request" desc="Convert language into Power BI requests." href="/powerbi-agent" />
              <BuiltinCard icon={ClipboardList} name="Project Agent" desc="Per-project scheduled summaries." href="/projects" />
            </>
          )}
        </CardContent>
      </Card>

      {editing && (
        <AgentEditor
          draft={editing}
          setDraft={setEditing}
          portfolios={portfolios}
          projects={projects}
          orgMembers={orgMembers}
          modelOptions={modelOptions}
          onSave={() => saveMutation.mutate(editing)}
          onClose={() => setEditing(null)}
          saving={saveMutation.isPending}
        />
      )}

      {logsForAgent && (
        <LogsDialog agent={logsForAgent} orgId={orgId!} onClose={() => setLogsForAgent(null)} />
      )}
    </div>
  );
}

function AgentSection({ title, emptyText, children }: { title: string; emptyText: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.filter(Boolean).length > 0;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {hasItems ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
        ) : (
          <div className="text-sm text-muted-foreground py-6 text-center">{emptyText}</div>
        )}
      </CardContent>
    </Card>
  );
}

function CustomAgentCard({ a, onEdit, onDuplicate, onRun, onLogs, onArchive, onDelete }: {
  a: Agent;
  onEdit: () => void; onDuplicate: () => void; onRun: () => void;
  onLogs: () => void; onArchive: () => void; onDelete: () => void;
}) {
  const Icon = ICON_MAP[a.icon || "Bot"] ?? Bot;
  const canManage = a.isOwner || a.isAdmin;
  return (
    <div
      className={`border rounded-lg p-3 flex flex-col gap-2 bg-card transition ${canManage ? "cursor-pointer hover:bg-accent/50 hover:border-primary/40" : ""}`}
      data-testid={`card-agent-${a.id}`}
      role={canManage ? "button" : undefined}
      tabIndex={canManage ? 0 : undefined}
      onClick={canManage ? onEdit : undefined}
      onKeyDown={canManage ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(); } } : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold truncate">{a.name}</div>
            <div className="text-[11px] text-muted-foreground flex gap-1 flex-wrap">
              <Badge variant="secondary" className="text-[10px]">{a.type}</Badge>
              <Badge variant="outline" className="text-[10px]">{a.model}</Badge>
              <Badge variant="outline" className="text-[10px]">{a.visibility}</Badge>
              {!a.enabled && <Badge variant="destructive" className="text-[10px]">disabled</Badge>}
              {!a.isOwner && a.createdByName && (
                <Badge variant="outline" className="text-[10px]" data-testid={`badge-shared-by-${a.id}`}>
                  Shared by {a.createdByName}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canManage && (
              <DropdownMenuItem onSelect={onEdit}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onDuplicate}><Copy className="h-4 w-4 mr-2" /> Duplicate</DropdownMenuItem>
            {a.type === "scheduled" && (
              <DropdownMenuItem onSelect={onRun}><Play className="h-4 w-4 mr-2" /> Run now</DropdownMenuItem>
            )}
            {a.type === "scheduled" && (
              <DropdownMenuItem onSelect={onLogs}><History className="h-4 w-4 mr-2" /> Run history</DropdownMenuItem>
            )}
            {canManage && (
              <DropdownMenuItem onSelect={onArchive} data-testid={`menu-archive-${a.id}`}>
                <ArchiveIcon className="h-4 w-4 mr-2" /> Archive
              </DropdownMenuItem>
            )}
            {canManage && (
              <DropdownMenuItem onSelect={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
      {a.description && <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>}
      {a.type === "scheduled" && (
        <div className="text-[11px] text-muted-foreground">
          {a.scheduleDay != null && a.scheduleTime ? `Weekly · ${DAYS[a.scheduleDay]} ${a.scheduleTime} (${a.timezone || "ET"})` : "No schedule"}
          {a.nextRun && <> · next {new Date(a.nextRun).toLocaleString()}</>}
        </div>
      )}
    </div>
  );
}

function BuiltinCard({ icon: Icon, name, desc, href }: { icon: any; name: string; desc: string; href?: string }) {
  const content = (
    <div className="border rounded-lg p-4 flex items-start gap-3 hover:bg-accent transition">
      <Icon className="h-5 w-5 text-primary mt-0.5" />
      <div className="min-w-0">
        <div className="font-semibold">{name}</div>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
  return href ? <a href={href}>{content}</a> : content;
}

function AgentEditor({ draft, setDraft, portfolios, projects, orgMembers, modelOptions, onSave, onClose, saving }: {
  draft: Partial<Agent> & { memberIds: string[] };
  setDraft: (d: any) => void;
  portfolios: Portfolio[]; projects: Project[]; orgMembers: OrgMember[];
  modelOptions: ModelOption[];
  onSave: () => void; onClose: () => void; saving: boolean;
}) {
  const update = (patch: Partial<Agent>) => setDraft({ ...draft, ...patch });
  const updateScope = (patch: any) => update({ dataScope: { ...(draft.dataScope as any), ...patch } });
  const recipientsText = useMemo(() => (draft.recipientEmails ?? []).join(", "), [draft.recipientEmails]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit agent" : "New agent"}</DialogTitle>
          <DialogDescription>Configure your agent's behavior, data scope, and access.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basics" className="space-y-4 flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="data">Data scope</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
            <TabsTrigger value="schedule" disabled={draft.type !== "scheduled"}>Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-4 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={draft.type} onValueChange={(v: any) => update({ type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chat">Chat agent</SelectItem>
                    <SelectItem value="scheduled">Scheduled agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Model</Label>
                <Select value={draft.model} onValueChange={(v: any) => update({ model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {modelOptions.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={draft.name ?? ""} onChange={e => update({ name: e.target.value })} placeholder="Weekly status digest" data-testid="input-agent-name" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={draft.description ?? ""} onChange={e => update({ description: e.target.value })} />
            </div>
            <div>
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-1.5">
                {ICON_OPTIONS.map(name => {
                  const I = ICON_MAP[name];
                  const selected = draft.icon === name;
                  return (
                    <button key={name} type="button" onClick={() => update({ icon: name })}
                      className={`h-8 w-8 rounded border flex items-center justify-center ${selected ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}>
                      <I className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>System prompt</Label>
              <Textarea rows={6} value={draft.systemPrompt ?? ""} onChange={e => update({ systemPrompt: e.target.value })} data-testid="input-system-prompt" />
            </div>
            <div>
              <Label>Allowed actions (tools)</Label>
              <p className="text-[11px] text-muted-foreground mb-1">
                The agent can read all data in its scope by default. Each
                checked action is an explicit write or send permission.
              </p>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {(draft.type === "scheduled" ? SCHEDULED_TOOLS : CHAT_TOOLS).map(t => {
                  const checked = (draft.allowedTools ?? []).includes(t);
                  return (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={checked} onChange={e => {
                        const cur = new Set(draft.allowedTools ?? []);
                        if (e.target.checked) cur.add(t); else cur.delete(t);
                        update({ allowedTools: Array.from(cur) });
                      }} data-testid={`checkbox-tool-${t}`} />
                      <code className="text-[11px]">{t}</code>
                    </label>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="data" className="space-y-3 flex-1 overflow-y-auto pr-1">
            <div>
              <Label>Scope</Label>
              <Select value={draft.dataScope?.type ?? "org"} onValueChange={(v: any) => update({ dataScope: { type: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="org">Whole organization</SelectItem>
                  <SelectItem value="portfolios">Specific portfolios</SelectItem>
                  <SelectItem value="projects">Specific projects</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.dataScope?.type === "portfolios" && (
              <ScopePicker
                items={portfolios.map(p => ({ id: p.id, label: p.name }))}
                selected={draft.dataScope?.portfolioIds ?? []}
                onChange={ids => updateScope({ portfolioIds: ids })}
              />
            )}
            {draft.dataScope?.type === "projects" && (
              <ScopePicker
                items={projects.map(p => ({ id: p.id, label: p.name }))}
                selected={draft.dataScope?.projectIds ?? []}
                onChange={ids => updateScope({ projectIds: ids })}
              />
            )}
          </TabsContent>

          <TabsContent value="access" className="space-y-3 flex-1 overflow-y-auto pr-1">
            <div>
              <Label>Visibility</Label>
              <Select value={draft.visibility} onValueChange={(v: any) => update({ visibility: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private — only me</SelectItem>
                  <SelectItem value="org">Whole organization</SelectItem>
                  <SelectItem value="members">Selected members</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.visibility === "members" && (
              <ScopePicker
                items={orgMembers.map(m => ({ id: m.userId as any, label: `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email || m.userId }))}
                selected={draft.memberIds ?? []}
                onChange={(ids: any) => setDraft({ ...draft, memberIds: ids })}
                stringIds
              />
            )}
            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch checked={!!draft.enabled} onCheckedChange={v => update({ enabled: v })} />
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-3 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Day of week</Label>
                <Select value={String(draft.scheduleDay ?? 1)} onValueChange={(v) => update({ scheduleDay: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Time</Label>
                <Input type="time" value={draft.scheduleTime ?? "09:00"} onChange={e => update({ scheduleTime: e.target.value })} />
              </div>
              <div>
                <Label>Timezone</Label>
                <Input value={draft.timezone ?? "America/New_York"} onChange={e => update({ timezone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Recipient emails (comma separated)</Label>
              <Input value={recipientsText} onChange={e => update({ recipientEmails: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
            </div>
            <div>
              <Label>Email subject (optional)</Label>
              <Input value={draft.emailSubject ?? ""} onChange={e => update({ emailSubject: e.target.value })} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !draft.name || !draft.systemPrompt} data-testid="button-save-agent">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopePicker({ items, selected, onChange, stringIds }: {
  items: { id: any; label: string }[];
  selected: any[];
  onChange: (ids: any[]) => void;
  stringIds?: boolean;
}) {
  return (
    <div className="border rounded p-2 max-h-56 overflow-y-auto space-y-1">
      {items.length === 0 ? <div className="text-xs text-muted-foreground p-2">No options</div> : items.map(it => {
        const checked = selected.includes(it.id);
        return (
          <label key={String(it.id)} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={checked} onChange={e => {
              const cur = new Set(selected);
              if (e.target.checked) cur.add(it.id); else cur.delete(it.id);
              onChange(Array.from(cur));
            }} />
            <span className="truncate">{it.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function LogsDialog({ agent, orgId, onClose }: { agent: Agent; orgId: number; onClose: () => void }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/agents", agent.id, "logs"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agent.id}/logs?organizationId=${orgId}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{agent.name} — run history</DialogTitle></DialogHeader>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : data.length === 0 ? (
          <div className="text-sm text-muted-foreground">No runs yet.</div>
        ) : (
          <div className="space-y-2">
            {data.map(log => (
              <div key={log.id} className="border rounded p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant={log.status === "success" ? "default" : log.status === "error" ? "destructive" : "secondary"}>{log.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                {log.subject && <div className="font-medium mt-1 text-xs">{log.subject}</div>}
                {log.errorMessage && <div className="text-xs text-destructive mt-1">{log.errorMessage}</div>}
                {log.recipientEmails && <div className="text-xs text-muted-foreground mt-1">To: {log.recipientEmails.join(", ")}</div>}
                {log.emailPreview && <pre className="text-[11px] mt-1 bg-muted p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto">{log.emailPreview.slice(0, 800)}</pre>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
