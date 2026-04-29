import { useState, useMemo } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import { useChangeOrders, useCreateChangeOrder, useUpdateChangeOrder, useDeleteChangeOrder, usePromoteChangeOrder, useApproveChangeOrder } from "@/hooks/use-change-orders";
import type { ChangeOrder } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Plus, Trash2, MoreVertical, Pencil, CheckCircle, FileText, ArrowUpRight, DollarSign } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn, normalizeSearch } from "@/lib/utils";
import { Link } from "wouter";
import { format } from "date-fns";

const TIERS = ["PCO", "COR", "CO"] as const;
const STATUSES = ["Draft", "Pending", "Under Review", "Approved", "Rejected", "Void"] as const;
const REASON_CODES = ["Owner Request", "Design Error", "Unforeseen Conditions", "Value Engineering", "Code Requirement", "Scope Addition", "Schedule Acceleration", "Material Substitution", "Other"];

const tierColors: Record<string, string> = {
  PCO: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  COR: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  CO: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};
const statusColors: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Pending: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Under Review": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Rejected: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  Void: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function formatCurrency(amount: string | number | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

export default function ChangeOrders() {
  const { currentOrganization } = useOrganization();
  const { data: projects, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: changeOrders, isLoading } = useChangeOrders(selectedProjectId);
  const createMutation = useCreateChangeOrder();
  const updateMutation = useUpdateChangeOrder();
  const deleteMutation = useDeleteChangeOrder();
  const promoteMutation = usePromoteChangeOrder();
  const approveMutation = useApproveChangeOrder();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCO, setEditingCO] = useState<ChangeOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChangeOrder | null>(null);
  const [formProjectId, setFormProjectId] = useState<number | undefined>();
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTier, setFormTier] = useState<string>("PCO");
  const [formStatus, setFormStatus] = useState<string>("Draft");
  const [formReasonCode, setFormReasonCode] = useState("");
  const [formCostImpact, setFormCostImpact] = useState("");
  const [formScheduleImpact, setFormScheduleImpact] = useState("");
  const [formRequestedBy, setFormRequestedBy] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const resetForm = () => {
    setFormTitle(""); setFormDescription(""); setFormTier("PCO"); setFormStatus("Draft");
    setFormReasonCode(""); setFormCostImpact(""); setFormScheduleImpact(""); setFormRequestedBy("");
    setFormNotes(""); setEditingCO(null); setFormProjectId(selectedProjectId);
  };

  const openCreate = () => { resetForm(); setIsDialogOpen(true); };

  const openEdit = (co: ChangeOrder) => {
    setEditingCO(co); setFormProjectId(co.projectId); setFormTitle(co.title);
    setFormDescription(co.description || ""); setFormTier(co.tier); setFormStatus(co.status);
    setFormReasonCode(co.reasonCode || ""); setFormCostImpact(co.costImpact != null ? String(co.costImpact) : "");
    setFormScheduleImpact(String(co.scheduleImpactDays || "")); setFormRequestedBy(co.requestedBy || "");
    setFormNotes(co.notes || ""); setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const pid = editingCO ? editingCO.projectId : formProjectId;
    if (!pid) { toast({ title: "Error", description: "Select a project", variant: "destructive" }); return; }
    if (!formTitle.trim()) { toast({ title: "Error", description: "Title is required", variant: "destructive" }); return; }
    const data: Record<string, unknown> = {
      title: formTitle.trim(), description: formDescription.trim() || null, tier: formTier, status: formStatus,
      reasonCode: formReasonCode || null, costImpact: formCostImpact || null,
      scheduleImpactDays: formScheduleImpact ? parseInt(formScheduleImpact) : null,
      requestedBy: formRequestedBy || null, notes: formNotes || null,
    };
    if (editingCO) {
      updateMutation.mutate({ projectId: pid, changeOrderId: editingCO.id, data }, { onSuccess: () => { setIsDialogOpen(false); resetForm(); } });
    } else {
      createMutation.mutate({ projectId: pid, data }, { onSuccess: () => { setIsDialogOpen(false); resetForm(); } });
    }
  };

  const allChangeOrders = useMemo(() => {
    if (!changeOrders) return [];
    return changeOrders.filter(co => {
      const matchesSearch = normalizeSearch(co.title).includes(normalizeSearch(search)) ||
        normalizeSearch(co.changeOrderNumber || "").includes(normalizeSearch(search));
      const matchesTier = tierFilter === "all" || co.tier === tierFilter;
      const matchesStatus = statusFilter === "all" || co.status === statusFilter;
      return matchesSearch && matchesTier && matchesStatus;
    });
  }, [changeOrders, search, tierFilter, statusFilter]);

  const getProjectName = (pid: number) => projects?.find(p => p.id === pid)?.name || "Unknown";

  if (projectsLoading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Change Orders</h1>
            <p className="text-muted-foreground">Track scope and cost changes across projects</p>
          </div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Change Order</Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-lg">All Change Orders</CardTitle>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Select value={selectedProjectId?.toString() || ""} onValueChange={v => setSelectedProjectId(v ? Number(v) : undefined)}>
                  <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    {projects?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-full md:w-[200px]" />
                </div>
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="w-full md:w-[120px]"><SelectValue placeholder="Tier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    {TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedProjectId ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">Select a project</h3>
                <p className="text-muted-foreground text-sm mt-1">Choose a project to view its change orders</p>
              </div>
            ) : isLoading ? (
              <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : allChangeOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">No change orders found</h3>
                <p className="text-muted-foreground text-sm mt-1">Create a change order to get started</p>
              </div>
            ) : (
              <div className="divide-y">
                {allChangeOrders.map(co => (
                  <div key={co.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium truncate">{co.title}</h4>
                          <span className="text-muted-foreground text-sm">{co.changeOrderNumber}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Link href={`/projects/${co.projectId}`} className="hover:text-primary hover:underline">{getProjectName(co.projectId)}</Link>
                          {co.reasonCode && <><span className="text-muted-foreground/50">|</span><span>{co.reasonCode}</span></>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 pl-[52px] sm:pl-0">
                      <div className="font-semibold">{formatCurrency(co.costImpact)}</div>
                      <Badge className={cn("whitespace-nowrap", tierColors[co.tier])}>{co.tier}</Badge>
                      <Badge className={cn("whitespace-nowrap", statusColors[co.status])}>{co.status}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(co)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                          {co.tier !== "CO" && co.status !== "Void" && (
                            <DropdownMenuItem onClick={() => promoteMutation.mutate({ projectId: co.projectId, changeOrderId: co.id })}>
                              <ArrowUpRight className="mr-2 h-4 w-4" />Promote to {co.tier === "PCO" ? "COR" : "CO"}
                            </DropdownMenuItem>
                          )}
                          {co.status !== "Approved" && co.status !== "Void" && (
                            <DropdownMenuItem onClick={() => approveMutation.mutate({ projectId: co.projectId, changeOrderId: co.id })}>
                              <CheckCircle className="mr-2 h-4 w-4" />Approve
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(co)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { setIsDialogOpen(false); resetForm(); } else setIsDialogOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingCO ? "Edit Change Order" : "New Change Order"}</DialogTitle>
            <DialogDescription>{editingCO ? "Update change order details" : "Create a new change order"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            {!editingCO && (
              <div className="space-y-2">
                <Label>Project *</Label>
                <Select value={formProjectId?.toString() || ""} onValueChange={v => setFormProjectId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>{projects?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Title *</Label><Input value={formTitle} onChange={e => setFormTitle(e.target.value)} /></div>
              <div className="space-y-2"><Label>Tier</Label>
                <Select value={formTier} onValueChange={setFormTier} disabled={!!editingCO}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={3} /></div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2"><Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-2"><Label>Reason</Label>
                <Select value={formReasonCode} onValueChange={setFormReasonCode}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{REASON_CODES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-2"><Label>Requested By</Label><Input value={formRequestedBy} onChange={e => setFormRequestedBy(e.target.value)} /></div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Cost Impact ($)</Label><Input type="number" step="0.01" value={formCostImpact} onChange={e => setFormCostImpact(e.target.value)} /></div>
              <div className="space-y-2"><Label>Schedule Impact (days)</Label><Input type="number" value={formScheduleImpact} onChange={e => setFormScheduleImpact(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingCO ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Change Order</DialogTitle>
            <DialogDescription>Are you sure? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteTarget) deleteMutation.mutate({ projectId: deleteTarget.projectId, changeOrderId: deleteTarget.id }, { onSuccess: () => setDeleteTarget(null) }); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
