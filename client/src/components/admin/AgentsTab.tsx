import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Loader2, Search, MoreHorizontal, Bot, Database, Briefcase, RefreshCw, Save,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type AgentStatus = "active" | "scheduled" | "errored" | "disabled" | "archived";

interface CustomAgentRow {
  id: number;
  organizationId: number;
  organizationName: string | null;
  createdBy: string;
  createdByName: string | null;
  createdByEmail: string | null;
  type: "chat" | "scheduled";
  name: string;
  description: string | null;
  enabled: boolean;
  visibility: "private" | "org" | "members";
  archivedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  model: string;
  systemPrompt?: string;
  allowedTools?: string[];
  scheduleDay?: number | null;
  scheduleTime?: string | null;
  timezone?: string | null;
  recipientEmails?: string[] | null;
  emailSubject?: string | null;
  lastRun?: string | null;
  nextRun?: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  erroredLast7d: boolean;
  status: AgentStatus;
}

interface CustomAgentsPage {
  total: number;
  limit: number;
  offset: number;
  items: CustomAgentRow[];
}

interface CustomAgentDetail extends CustomAgentRow {
  systemPrompt: string;
  dataScope: { type: "org" | "portfolios" | "projects"; portfolioIds?: number[]; projectIds?: number[] };
  allowedTools: string[];
  memberIds: string[];
  recentLogs: Array<{
    id: number;
    status: "success" | "error" | "skipped";
    subject: string | null;
    recipientEmails: string[] | null;
    emailPreview: string | null;
    errorMessage: string | null;
    createdAt: string | null;
    triggeredBy: string | null;
  }>;
  conversationCount: number;
}

interface BuiltinProviderRedacted {
  azure?: {
    endpoint: string | null;
    deployment: string | null;
    apiVersion: string | null;
    apiKeySet: boolean;
  };
  openai?: {
    baseURL: string | null;
    apiKeySet: boolean;
  };
  anthropic?: {
    apiKeySet: boolean;
  };
}

interface BuiltinAgentRow {
  id: number;
  key: "friday" | "powerbi" | "project_agent";
  name: string;
  description: string;
  builtinDefaultPrompt: string;
  builtinDefaultModel: string;
  enabled: boolean;
  defaultSystemPrompt: string | null;
  defaultModel: string | null;
  providerConfig: BuiltinProviderRedacted | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface RunHistoryRow {
  id: number;
  agentId: number;
  agentName: string | null;
  agentType: string | null;
  organizationId: number | null;
  organizationName: string | null;
  status: "success" | "error" | "skipped";
  subject: string | null;
  recipientEmails: string[] | null;
  emailPreview: string | null;
  errorMessage: string | null;
  triggeredBy: string | null;
  createdAt: string | null;
}

interface RunHistoryPage {
  total: number;
  limit: number;
  offset: number;
  items: RunHistoryRow[];
}

const PAGE_SIZE = 50;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const STATUS_BADGE: Record<AgentStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  scheduled: { label: "Scheduled", variant: "default" },
  errored: { label: "Errored 7d", variant: "destructive" },
  disabled: { label: "Disabled", variant: "secondary" },
  archived: { label: "Archived", variant: "outline" },
};

// ---------------------------------------------------------------------------
// Custom agent edit drawer
// ---------------------------------------------------------------------------

function CustomAgentEditSheet({
  agentId,
  open,
  onOpenChange,
}: {
  agentId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: detail, isLoading } = useQuery<CustomAgentDetail>({
    queryKey: ["/api/admin/agents/custom", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/agents/custom/${agentId}`);
      if (!res.ok) throw new Error("Failed to load agent detail");
      return res.json();
    },
    enabled: open && agentId != null,
  });

  // Form state, hydrated whenever the detail loads.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [visibility, setVisibility] = useState<"private" | "org" | "members">("private");
  const [enabled, setEnabled] = useState(true);
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [scheduleDay, setScheduleDay] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("");
  const [recipientEmails, setRecipientEmails] = useState<string>("");
  const [emailSubject, setEmailSubject] = useState<string>("");

  useEffect(() => {
    if (!detail) return;
    setName(detail.name);
    setDescription(detail.description ?? "");
    setSystemPrompt(detail.systemPrompt);
    setModel(detail.model);
    setVisibility(detail.visibility);
    setEnabled(detail.enabled);
    setAllowedTools(detail.allowedTools ?? []);
    setScheduleDay(detail.scheduleDay != null ? String(detail.scheduleDay) : "");
    setScheduleTime(detail.scheduleTime ?? "");
    setTimezone(detail.timezone ?? "");
    setRecipientEmails((detail.recipientEmails ?? []).join(", "));
    setEmailSubject(detail.emailSubject ?? "");
  }, [detail]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error("Not loaded");
      const body: Record<string, unknown> = {
        name,
        description: description.trim() === "" ? null : description,
        systemPrompt,
        model,
        visibility,
        enabled,
        allowedTools,
      };
      if (detail.type === "scheduled") {
        body.scheduleDay = scheduleDay === "" ? null : Number(scheduleDay);
        body.scheduleTime = scheduleTime.trim() === "" ? null : scheduleTime.trim();
        body.timezone = timezone.trim() === "" ? null : timezone.trim();
        body.recipientEmails = recipientEmails
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        body.emailSubject = emailSubject.trim() === "" ? null : emailSubject.trim();
      }
      return apiRequest("PATCH", `/api/admin/agents/custom/${detail.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/custom"] });
      toast({ title: "Agent updated" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const TOOL_OPTIONS: Array<{ id: string; label: string }> = [
    { id: "create_task", label: "Create task" },
    { id: "create_mitigation", label: "Create risk mitigation" },
    { id: "assign_owner", label: "Assign owner" },
    { id: "add_note", label: "Add project note" },
    { id: "flag_for_review", label: "Flag for review" },
    { id: "send_email", label: "Send email (scheduled)" },
  ];

  const toggleTool = (id: string, on: boolean) => {
    setAllowedTools((prev) => (on ? Array.from(new Set([...prev, id])) : prev.filter((t) => t !== id)));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{detail ? `Edit "${detail.name}"` : "Loading agent…"}</SheetTitle>
          <SheetDescription>
            {detail ? <>Org: {detail.organizationName ?? "—"} (#{detail.organizationId}) · Owner: {detail.createdByName ?? detail.createdByEmail ?? "—"}</> : null}
          </SheetDescription>
        </SheetHeader>
        {isLoading || !detail ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-4">
            <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-xs">
              <div><span className="text-muted-foreground">Type:</span> <Badge variant="outline" className="ml-1 capitalize">{detail.type}</Badge></div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={(STATUS_BADGE[detail.status] ?? STATUS_BADGE.active).variant} className="ml-1">{(STATUS_BADGE[detail.status] ?? STATUS_BADGE.active).label}</Badge></div>
              <div><span className="text-muted-foreground">Last run:</span> {fmtDate(detail.lastRunAt)}</div>
              <div><span className="text-muted-foreground">Next run:</span> {fmtDate(detail.nextRun ?? null)}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Conversations:</span> {detail.conversationCount}</div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-edit-name" />
              </div>
              <div>
                <Label htmlFor="edit-model">Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger id="edit-model" data-testid="select-edit-model"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                    <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea id="edit-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} data-testid="textarea-edit-description" />
            </div>

            <div>
              <Label htmlFor="edit-prompt">System prompt</Label>
              <Textarea id="edit-prompt" rows={8} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="font-mono text-xs" data-testid="textarea-edit-prompt" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as any)}>
                  <SelectTrigger data-testid="select-edit-visibility"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="org">Org-wide</SelectItem>
                    <SelectItem value="members">Specific members</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Switch checked={enabled} onCheckedChange={setEnabled} id="edit-enabled" data-testid="switch-edit-enabled" />
                <Label htmlFor="edit-enabled" className="cursor-pointer">{enabled ? "Enabled" : "Disabled"}</Label>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Allowed tools</Label>
              <div className="grid grid-cols-2 gap-2">
                {TOOL_OPTIONS.map((opt) => {
                  const on = allowedTools.includes(opt.id);
                  return (
                    <label key={opt.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggleTool(opt.id, e.target.checked)}
                        data-testid={`checkbox-tool-${opt.id}`}
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {detail.type === "scheduled" && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="text-sm font-medium">Schedule</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Day of week</Label>
                    <Select value={scheduleDay} onValueChange={setScheduleDay}>
                      <SelectTrigger data-testid="select-edit-day"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Sun</SelectItem>
                        <SelectItem value="1">Mon</SelectItem>
                        <SelectItem value="2">Tue</SelectItem>
                        <SelectItem value="3">Wed</SelectItem>
                        <SelectItem value="4">Thu</SelectItem>
                        <SelectItem value="5">Fri</SelectItem>
                        <SelectItem value="6">Sat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Time (HH:MM)</Label>
                    <Input value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} placeholder="09:00" data-testid="input-edit-time" />
                  </div>
                  <div>
                    <Label>Timezone</Label>
                    <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" data-testid="input-edit-tz" />
                  </div>
                </div>
                <div>
                  <Label>Recipient emails (comma or newline separated)</Label>
                  <Textarea
                    rows={2}
                    value={recipientEmails}
                    onChange={(e) => setRecipientEmails(e.target.value)}
                    placeholder="ops@example.com, lead@example.com"
                    data-testid="textarea-edit-recipients"
                  />
                </div>
                <div>
                  <Label>Email subject</Label>
                  <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} data-testid="input-edit-subject" />
                </div>
              </div>
            )}

            {detail.recentLogs.length > 0 && (
              <div className="space-y-2">
                <Label>Recent runs</Label>
                <div className="max-h-48 space-y-1 overflow-auto rounded-md border p-2 text-xs">
                  {detail.recentLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 border-b py-1 last:border-b-0">
                      <Badge variant={log.status === "success" ? "default" : log.status === "error" ? "destructive" : "secondary"} className="mt-0.5 capitalize">{log.status}</Badge>
                      <div className="flex-1">
                        <div className="text-xs">{fmtDate(log.createdAt)} · {log.subject ?? "—"}</div>
                        {log.errorMessage && <div className="text-xs text-destructive">{log.errorMessage}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-edit-cancel">Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!detail || saveMut.isPending} data-testid="button-edit-save">
            {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Custom agents sub-tab
// ---------------------------------------------------------------------------

function CustomAgentsPanel() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (enabledFilter !== "all") p.set("enabled", enabledFilter);
    if (visibilityFilter !== "all") p.set("visibility", visibilityFilter);
    if (typeFilter !== "all") p.set("type", typeFilter);
    // Status filter maps to a combination of `archived` + `errored7d` query params.
    if (statusFilter === "active") p.set("archived", "false");
    else if (statusFilter === "archived") p.set("archived", "true");
    else if (statusFilter === "errored7d") {
      p.set("archived", "false");
      p.set("errored7d", "true");
    }
    if (orgFilter) p.set("organizationId", orgFilter);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(page * PAGE_SIZE));
    return p.toString();
  }, [search, enabledFilter, visibilityFilter, typeFilter, statusFilter, orgFilter, page]);

  const queryKey = ["/api/admin/agents/custom", queryParams];
  const { data, isLoading, refetch, isFetching } = useQuery<CustomAgentsPage>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/admin/agents/custom?${queryParams}`);
      if (!res.ok) throw new Error("Failed to load custom agents");
      return res.json();
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/custom"] });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest("PATCH", `/api/admin/agents/custom/${id}`, { enabled }),
    onSuccess: () => { invalidate(); toast({ title: "Agent updated" }); },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const disableMut = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/admin/agents/custom/${id}/disable`),
    onSuccess: () => { invalidate(); toast({ title: "Agent disabled" }); },
    onError: (e: any) => toast({ title: "Disable failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const archiveMut = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/admin/agents/custom/${id}/archive`),
    onSuccess: () => { invalidate(); toast({ title: "Agent archived" }); },
    onError: (e: any) => toast({ title: "Archive failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const unarchiveMut = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/admin/agents/custom/${id}/unarchive`),
    onSuccess: () => { invalidate(); toast({ title: "Agent restored" }); },
    onError: (e: any) => toast({ title: "Restore failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/agents/custom/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Agent deleted" }); },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card data-testid="card-custom-agents">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" /> Custom agents
            </CardTitle>
            <CardDescription>Cross-org list of user-built agents. Total: {total}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-custom-agents">
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Label htmlFor="agent-search" className="text-xs text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="agent-search"
                placeholder="Name or description..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-8"
                data-testid="input-agent-search"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Org ID</Label>
            <Input
              type="number"
              placeholder="all"
              value={orgFilter}
              onChange={(e) => { setOrgFilter(e.target.value); setPage(0); }}
              data-testid="input-agent-org-filter"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger data-testid="select-agent-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="errored7d">Errored last 7 days</SelectItem>
                <SelectItem value="archived">Archived only</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Enabled</Label>
            <Select value={enabledFilter} onValueChange={(v) => { setEnabledFilter(v); setPage(0); }}>
              <SelectTrigger data-testid="select-agent-enabled"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Enabled</SelectItem>
                <SelectItem value="false">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Visibility</Label>
            <Select value={visibilityFilter} onValueChange={(v) => { setVisibilityFilter(v); setPage(0); }}>
              <SelectTrigger data-testid="select-agent-visibility"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="org">Org</SelectItem>
                <SelectItem value="members">Members</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger data-testid="select-agent-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Org</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.items ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                      No agents match your filters.
                    </TableCell>
                  </TableRow>
                )}
                {(data?.items ?? []).map((a) => {
                  const sb = STATUS_BADGE[a.status];
                  return (
                  <TableRow key={a.id} data-testid={`row-agent-${a.id}`}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      {a.description && <div className="text-xs text-muted-foreground line-clamp-1">{a.description}</div>}
                      <div className="mt-0.5 text-[10px] text-muted-foreground font-mono">{a.model}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.organizationName ?? "—"}
                      <div className="text-xs text-muted-foreground">#{a.organizationId}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{a.createdByName ?? "—"}</div>
                      {a.createdByEmail && <div className="text-xs text-muted-foreground">{a.createdByEmail}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{a.type}</Badge>
                      <div className="mt-0.5">
                        <Badge variant="secondary" className="capitalize text-[10px]">{a.visibility}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={sb.variant} data-testid={`badge-status-${a.id}`}>{sb.label}</Badge>
                      {a.lastRunStatus && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">last: {a.lastRunStatus}</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(a.lastRunAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(a.nextRun ?? null)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={a.enabled}
                        onCheckedChange={(v) => toggleEnabled.mutate({ id: a.id, enabled: v })}
                        disabled={toggleEnabled.isPending || !!a.archivedAt}
                        data-testid={`switch-agent-enabled-${a.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-agent-menu-${a.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setEditingId(a.id)}
                            data-testid={`menuitem-edit-${a.id}`}
                          >
                            View / edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!a.enabled || disableMut.isPending}
                            onClick={() => disableMut.mutate(a.id)}
                            data-testid={`menuitem-disable-${a.id}`}
                          >
                            Disable
                          </DropdownMenuItem>
                          {a.archivedAt ? (
                            <DropdownMenuItem
                              disabled={unarchiveMut.isPending}
                              onClick={() => unarchiveMut.mutate(a.id)}
                              data-testid={`menuitem-unarchive-${a.id}`}
                            >
                              Restore from archive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              disabled={archiveMut.isPending}
                              onClick={() => archiveMut.mutate(a.id)}
                              data-testid={`menuitem-archive-${a.id}`}
                            >
                              Archive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={(e) => e.preventDefault()}
                                data-testid={`menuitem-delete-${a.id}`}
                              >
                                Delete permanently
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{a.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the agent and all its conversations,
                                  messages, and run history. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMut.mutate(a.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  data-testid={`button-confirm-delete-${a.id}`}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · Showing {(data?.items ?? []).length} of {total}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} data-testid="button-prev-page">
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="button-next-page">
              Next
            </Button>
          </div>
        </div>
      </CardContent>

      <CustomAgentEditSheet
        agentId={editingId}
        open={editingId != null}
        onOpenChange={(v) => { if (!v) setEditingId(null); }}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Built-in agents sub-tab
// ---------------------------------------------------------------------------

const BUILTIN_ICON: Record<BuiltinAgentRow["key"], typeof Bot> = {
  friday: Bot,
  powerbi: Database,
  project_agent: Briefcase,
};

function BuiltinAgentCard({ agent }: { agent: BuiltinAgentRow }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(agent.enabled);
  const [prompt, setPrompt] = useState(agent.defaultSystemPrompt ?? "");
  const [model, setModel] = useState(agent.defaultModel ?? "");
  const [showDefault, setShowDefault] = useState(false);
  const [showProvider, setShowProvider] = useState(false);

  // Provider config inputs. Secrets are never returned by the API; we send a
  // value only when the field is non-empty (and merge server-side so we don't
  // clobber other sections).
  const cfg = agent.providerConfig ?? {};
  const [azureEndpoint, setAzureEndpoint] = useState<string>(cfg.azure?.endpoint ?? "");
  const [azureDeployment, setAzureDeployment] = useState<string>(cfg.azure?.deployment ?? "");
  const [azureApiVersion, setAzureApiVersion] = useState<string>(cfg.azure?.apiVersion ?? "");
  const [azureApiKey, setAzureApiKey] = useState<string>("");
  const [openaiBaseURL, setOpenaiBaseURL] = useState<string>(cfg.openai?.baseURL ?? "");
  const [openaiApiKey, setOpenaiApiKey] = useState<string>("");
  const [anthropicApiKey, setAnthropicApiKey] = useState<string>("");

  const Icon = BUILTIN_ICON[agent.key];

  const saveMut = useMutation({
    mutationFn: async (patch: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/admin/agents/builtin/${agent.key}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/builtin"] });
      toast({ title: `${agent.name} updated` });
      setAzureApiKey(""); setOpenaiApiKey(""); setAnthropicApiKey("");
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const handleSavePromptModel = () => {
    saveMut.mutate({
      enabled,
      defaultSystemPrompt: prompt.trim() === "" ? null : prompt,
      defaultModel: model.trim() === "" ? null : model,
    });
  };

  const handleSaveProvider = () => {
    const providerConfig: Record<string, any> = {};
    const azure: Record<string, any> = {};
    if (azureEndpoint.trim()) azure.endpoint = azureEndpoint.trim();
    if (azureDeployment.trim()) azure.deployment = azureDeployment.trim();
    if (azureApiVersion.trim()) azure.apiVersion = azureApiVersion.trim();
    if (azureApiKey) azure.apiKey = azureApiKey;
    if (Object.keys(azure).length > 0) providerConfig.azure = azure;
    const openai: Record<string, any> = {};
    if (openaiBaseURL.trim()) openai.baseURL = openaiBaseURL.trim();
    if (openaiApiKey) openai.apiKey = openaiApiKey;
    if (Object.keys(openai).length > 0) providerConfig.openai = openai;
    if (anthropicApiKey) providerConfig.anthropic = { apiKey: anthropicApiKey };
    saveMut.mutate({ providerConfig });
  };

  const handleClearProvider = () => {
    saveMut.mutate({ providerConfig: null });
    setAzureEndpoint(""); setAzureDeployment(""); setAzureApiVersion("");
    setAzureApiKey(""); setOpenaiBaseURL(""); setOpenaiApiKey(""); setAnthropicApiKey("");
  };

  const handleResetPrompt = () => setPrompt("");
  const handleResetModel = () => setModel("");

  const showAzure = agent.key === "friday" || agent.key === "project_agent";
  const showOpenAI = true;
  const showAnthropic = agent.key === "powerbi";

  return (
    <Card data-testid={`card-builtin-${agent.key}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-muted p-2">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <CardDescription>{agent.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`switch-${agent.key}`} className="text-sm">
              {enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id={`switch-${agent.key}`}
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid={`switch-builtin-${agent.key}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor={`prompt-${agent.key}`}>Default system prompt override</Label>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowDefault((v) => !v)} data-testid={`button-show-default-${agent.key}`}>
                {showDefault ? "Hide" : "View"} platform default
              </Button>
              {prompt && (
                <Button type="button" variant="ghost" size="sm" onClick={handleResetPrompt} data-testid={`button-reset-prompt-${agent.key}`}>
                  Reset to default
                </Button>
              )}
            </div>
          </div>
          <Textarea
            id={`prompt-${agent.key}`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            placeholder="(empty — uses platform default)"
            className="mt-1 font-mono text-xs"
            data-testid={`textarea-prompt-${agent.key}`}
          />
          {showDefault && (
            <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap">
              {agent.builtinDefaultPrompt}
            </pre>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor={`model-${agent.key}`}>Default model override</Label>
              {model && (
                <Button type="button" variant="ghost" size="sm" onClick={handleResetModel} data-testid={`button-reset-model-${agent.key}`}>
                  Reset
                </Button>
              )}
            </div>
            <Input
              id={`model-${agent.key}`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={agent.builtinDefaultModel}
              className="mt-1 font-mono text-xs"
              data-testid={`input-model-${agent.key}`}
            />
            <div className="mt-1 text-xs text-muted-foreground">
              Platform default: <span className="font-mono">{agent.builtinDefaultModel}</span>
            </div>
          </div>
          <div className="flex items-end">
            <div className="text-xs text-muted-foreground">
              {agent.updatedAt ? <>Last updated {fmtDate(agent.updatedAt)}</> : "No overrides yet"}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSavePromptModel} disabled={saveMut.isPending} data-testid={`button-save-${agent.key}`}>
            {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save prompt &amp; model
          </Button>
        </div>

        <div className="border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowProvider((v) => !v)}
            data-testid={`button-toggle-provider-${agent.key}`}
          >
            {showProvider ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
            Provider credentials (advanced)
          </Button>
          {showProvider && (
            <div className="mt-3 space-y-4 rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                Override the platform-level credentials this agent uses. Leave a section empty to fall back to the
                <code className="mx-1">env vars</code>. API keys are write-only — saved keys are not displayed.
              </div>

              {showAzure && (
                <div className="space-y-2">
                  <div className="text-xs font-medium">Azure OpenAI {cfg.azure?.apiKeySet && <Badge variant="outline" className="ml-2 text-[10px]">key set</Badge>}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={azureEndpoint} onChange={(e) => setAzureEndpoint(e.target.value)} placeholder="https://…openai.azure.com" data-testid={`input-azure-endpoint-${agent.key}`} />
                    <Input value={azureDeployment} onChange={(e) => setAzureDeployment(e.target.value)} placeholder="deployment name" data-testid={`input-azure-deployment-${agent.key}`} />
                    <Input value={azureApiVersion} onChange={(e) => setAzureApiVersion(e.target.value)} placeholder="2024-12-01-preview" data-testid={`input-azure-version-${agent.key}`} />
                    <Input type="password" value={azureApiKey} onChange={(e) => setAzureApiKey(e.target.value)} placeholder="API key (leave blank to keep)" data-testid={`input-azure-key-${agent.key}`} />
                  </div>
                </div>
              )}

              {showOpenAI && (
                <div className="space-y-2">
                  <div className="text-xs font-medium">OpenAI {cfg.openai?.apiKeySet && <Badge variant="outline" className="ml-2 text-[10px]">key set</Badge>}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={openaiBaseURL} onChange={(e) => setOpenaiBaseURL(e.target.value)} placeholder="https://api.openai.com/v1 (optional)" data-testid={`input-openai-base-${agent.key}`} />
                    <Input type="password" value={openaiApiKey} onChange={(e) => setOpenaiApiKey(e.target.value)} placeholder="API key (leave blank to keep)" data-testid={`input-openai-key-${agent.key}`} />
                  </div>
                </div>
              )}

              {showAnthropic && (
                <div className="space-y-2">
                  <div className="text-xs font-medium">Anthropic {cfg.anthropic?.apiKeySet && <Badge variant="outline" className="ml-2 text-[10px]">key set</Badge>}</div>
                  <Input type="password" value={anthropicApiKey} onChange={(e) => setAnthropicApiKey(e.target.value)} placeholder="ANTHROPIC_API_KEY (leave blank to keep)" data-testid={`input-anthropic-key-${agent.key}`} />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleClearProvider} disabled={saveMut.isPending} data-testid={`button-clear-provider-${agent.key}`}>
                  Clear all
                </Button>
                <Button type="button" size="sm" onClick={handleSaveProvider} disabled={saveMut.isPending} data-testid={`button-save-provider-${agent.key}`}>
                  Save provider config
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BuiltinAgentsPanel() {
  const { data, isLoading } = useQuery<BuiltinAgentRow[]>({
    queryKey: ["/api/admin/agents/builtin"],
    queryFn: async () => {
      const res = await fetch("/api/admin/agents/builtin");
      if (!res.ok) throw new Error("Failed to load built-in agents");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(data ?? []).map((a) => (
        <BuiltinAgentCard key={a.key} agent={a} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run history sub-tab
// ---------------------------------------------------------------------------

function RunHistoryRowDetail({ row }: { row: RunHistoryRow }) {
  return (
    <div className="space-y-2 px-4 py-3 text-xs">
      <div><span className="font-medium">Subject:</span> {row.subject ?? "—"}</div>
      <div>
        <span className="font-medium">Recipients:</span>{" "}
        {row.recipientEmails && row.recipientEmails.length > 0
          ? row.recipientEmails.join(", ")
          : "—"}
      </div>
      {row.errorMessage && (
        <div>
          <span className="font-medium text-destructive">Error:</span>{" "}
          <span className="whitespace-pre-wrap text-destructive">{row.errorMessage}</span>
        </div>
      )}
      {row.emailPreview && (
        <div>
          <div className="font-medium">Email preview:</div>
          <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-muted p-3 whitespace-pre-wrap">
            {row.emailPreview}
          </pre>
        </div>
      )}
      <div className="text-muted-foreground">
        Triggered by: {row.triggeredBy ?? "—"} · Log #{row.id}
      </div>
    </div>
  );
}

function RunHistoryPanel() {
  const [orgFilter, setOrgFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (orgFilter) p.set("organizationId", orgFilter);
    if (agentFilter) p.set("agentId", agentFilter);
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to).toISOString());
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(page * PAGE_SIZE));
    return p.toString();
  }, [orgFilter, agentFilter, statusFilter, from, to, page]);

  const { data, isLoading, refetch, isFetching } = useQuery<RunHistoryPage>({
    queryKey: ["/api/admin/agents/run-history", params],
    queryFn: async () => {
      const res = await fetch(`/api/admin/agents/run-history?${params}`);
      if (!res.ok) throw new Error("Failed to load run history");
      return res.json();
    },
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Card data-testid="card-run-history">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Run history</CardTitle>
            <CardDescription>Cross-org custom agent run log. Total: {total}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-history">
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <div>
            <Label className="text-xs text-muted-foreground">Org ID</Label>
            <Input
              type="number"
              placeholder="all"
              value={orgFilter}
              onChange={(e) => { setOrgFilter(e.target.value); setPage(0); }}
              data-testid="input-history-org"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Agent ID</Label>
            <Input
              type="number"
              placeholder="all"
              value={agentFilter}
              onChange={(e) => { setAgentFilter(e.target.value); setPage(0); }}
              data-testid="input-history-agent"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger data-testid="select-history-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(0); }}
              data-testid="input-history-from"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(0); }}
              data-testid="input-history-to"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]" />
                  <TableHead>When</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Org</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Triggered by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.items ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      No runs match your filters.
                    </TableCell>
                  </TableRow>
                )}
                {(data?.items ?? []).map((row) => {
                  const isOpen = expanded.has(row.id);
                  return (
                    <>
                      <TableRow
                        key={row.id}
                        data-testid={`row-history-${row.id}`}
                        className="cursor-pointer"
                        onClick={() => toggleExpanded(row.id)}
                      >
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDate(row.createdAt)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{row.agentName ?? `#${row.agentId}`}</div>
                          {row.agentType && <Badge variant="outline" className="text-xs capitalize">{row.agentType}</Badge>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.organizationName ?? "—"}
                          {row.organizationId && <div className="text-xs text-muted-foreground">#{row.organizationId}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.status === "success" ? "default" : row.status === "error" ? "destructive" : "secondary"}>
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm">{row.subject ?? "—"}</TableCell>
                        <TableCell className="text-xs">{row.triggeredBy ?? "—"}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow data-testid={`row-history-detail-${row.id}`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            <RunHistoryRowDetail row={row} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · Showing {(data?.items ?? []).length} of {total}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} data-testid="button-history-prev">
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="button-history-next">
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Top-level Agents tab
// ---------------------------------------------------------------------------

export function AgentsTab() {
  const [sub, setSub] = useState<string>("custom");
  return (
    <div className="space-y-4">
      <Tabs value={sub} onValueChange={setSub}>
        <TabsList>
          <TabsTrigger value="custom" data-testid="tab-agents-custom">Custom agents</TabsTrigger>
          <TabsTrigger value="builtin" data-testid="tab-agents-builtin">Built-in agents</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-agents-history">Run history</TabsTrigger>
        </TabsList>
        <TabsContent value="custom" className="mt-4">
          <CustomAgentsPanel />
        </TabsContent>
        <TabsContent value="builtin" className="mt-4">
          <BuiltinAgentsPanel />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <RunHistoryPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
