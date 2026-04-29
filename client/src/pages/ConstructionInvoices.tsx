import { useState, useMemo } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import { useConstructionInvoices, useContractSummary, useCreateConstructionInvoice, useUpdateConstructionInvoice, useDeleteConstructionInvoice } from "@/hooks/use-construction-invoices";
import type { ConstructionInvoice } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Loader2, Search, Plus, Trash2, MoreVertical, Pencil, Receipt, DollarSign, CheckCircle, FileText, Clock, TrendingUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn, normalizeSearch } from "@/lib/utils";
import { Link } from "wouter";
import { format } from "date-fns";

const STATUSES = ["Draft", "Submitted", "Under Review", "Approved", "Paid", "Rejected"] as const;
const statusColors: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Under Review": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Paid: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  Rejected: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

function formatCurrency(amount: string | number | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

export default function ConstructionInvoices() {
  const { currentOrganization } = useOrganization();
  const { data: projects, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: invoices, isLoading } = useConstructionInvoices(selectedProjectId);
  const { data: contractSummary } = useContractSummary(selectedProjectId);
  const createMutation = useCreateConstructionInvoice();
  const updateMutation = useUpdateConstructionInvoice();
  const deleteMutation = useDeleteConstructionInvoice();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<ConstructionInvoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConstructionInvoice | null>(null);
  const [formProjectId, setFormProjectId] = useState<number | undefined>();
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState<string>("Draft");
  const [formCurrentBilled, setFormCurrentBilled] = useState("");
  const [formRetainage, setFormRetainage] = useState("");
  const [formPeriodFrom, setFormPeriodFrom] = useState("");
  const [formPeriodTo, setFormPeriodTo] = useState("");
  const [formVendorName, setFormVendorName] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const resetForm = () => {
    setFormTitle(""); setFormDescription(""); setFormStatus("Draft"); setFormCurrentBilled("");
    setFormRetainage(""); setFormPeriodFrom(""); setFormPeriodTo(""); setFormVendorName("");
    setFormNotes(""); setEditingInvoice(null); setFormProjectId(selectedProjectId);
  };

  const openCreate = () => { resetForm(); setIsDialogOpen(true); };

  const openEdit = (inv: ConstructionInvoice) => {
    setEditingInvoice(inv); setFormProjectId(inv.projectId); setFormTitle(inv.title);
    setFormDescription(inv.description || ""); setFormStatus(inv.status);
    setFormCurrentBilled(inv.currentBilled != null ? String(inv.currentBilled) : ""); setFormRetainage(inv.retainage != null ? String(inv.retainage) : "");
    setFormPeriodFrom(inv.periodFrom || ""); setFormPeriodTo(inv.periodTo || "");
    setFormVendorName(inv.vendorName || ""); setFormNotes(inv.notes || "");
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const pid = editingInvoice ? editingInvoice.projectId : formProjectId;
    if (!pid) { toast({ title: "Error", description: "Select a project", variant: "destructive" }); return; }
    if (!formTitle.trim()) { toast({ title: "Error", description: "Title is required", variant: "destructive" }); return; }
    const data: Record<string, unknown> = {
      title: formTitle.trim(), description: formDescription.trim() || null, status: formStatus,
      currentBilled: formCurrentBilled || null, retainage: formRetainage || null,
      periodFrom: formPeriodFrom || null, periodTo: formPeriodTo || null,
      vendorName: formVendorName || null, notes: formNotes || null,
    };
    if (editingInvoice) {
      updateMutation.mutate({ projectId: pid, invoiceId: editingInvoice.id, data }, { onSuccess: () => { setIsDialogOpen(false); resetForm(); } });
    } else {
      createMutation.mutate({ projectId: pid, data }, { onSuccess: () => { setIsDialogOpen(false); resetForm(); } });
    }
  };

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter(inv => {
      const matchesSearch = normalizeSearch(inv.title).includes(normalizeSearch(search)) ||
        normalizeSearch(inv.invoiceNumber || "").includes(normalizeSearch(search)) ||
        normalizeSearch(inv.vendorName || "").includes(normalizeSearch(search));
      const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  const getProjectName = (pid: number) => projects?.find(p => p.id === pid)?.name || "Unknown";

  if (projectsLoading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Payment Applications</h1>
            <p className="text-muted-foreground">Track invoices and payment applications across projects</p>
          </div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Invoice</Button>
        </div>

        {contractSummary && selectedProjectId && contractSummary.revisedContract > 0 && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Contract</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{formatCurrency(contractSummary.revisedContract)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Billed</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{formatCurrency(contractSummary.totalBilled)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{formatCurrency(contractSummary.totalPaid)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Remaining</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{formatCurrency(contractSummary.balanceRemaining)}</div></CardContent></Card>
          </div>
        )}

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-lg">All Invoices</CardTitle>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Select value={selectedProjectId?.toString() || ""} onValueChange={v => setSelectedProjectId(v ? Number(v) : undefined)}>
                  <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>{projects?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-full md:w-[200px]" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
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
                <Receipt className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">Select a project</h3>
                <p className="text-muted-foreground text-sm mt-1">Choose a project to view its invoices</p>
              </div>
            ) : isLoading ? (
              <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : filteredInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">No invoices found</h3>
                <p className="text-muted-foreground text-sm mt-1">Create an invoice to get started</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredInvoices.map(inv => (
                  <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                        <Receipt className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium truncate">{inv.title}</h4>
                          <span className="text-muted-foreground text-sm">{inv.invoiceNumber}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Link href={`/projects/${inv.projectId}`} className="hover:text-primary hover:underline">{getProjectName(inv.projectId)}</Link>
                          {inv.vendorName && <><span className="text-muted-foreground/50">|</span><span>{inv.vendorName}</span></>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 pl-[52px] sm:pl-0">
                      <div className="font-semibold">{formatCurrency(inv.currentBilled)}</div>
                      <Badge className={cn("whitespace-nowrap", statusColors[inv.status])}>{inv.status}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(inv)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                          {inv.status === "Draft" && (
                            <DropdownMenuItem onClick={() => updateMutation.mutate({ projectId: inv.projectId, invoiceId: inv.id, data: { status: "Submitted" } })}>
                              <FileText className="mr-2 h-4 w-4" />Submit</DropdownMenuItem>
                          )}
                          {inv.status === "Approved" && (
                            <DropdownMenuItem onClick={() => updateMutation.mutate({ projectId: inv.projectId, invoiceId: inv.id, data: { status: "Paid" } })}>
                              <DollarSign className="mr-2 h-4 w-4" />Mark Paid</DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(inv)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
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
            <DialogTitle>{editingInvoice ? "Edit Invoice" : "New Invoice"}</DialogTitle>
            <DialogDescription>{editingInvoice ? "Update invoice details" : "Create a new payment application"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            {!editingInvoice && (
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
              <div className="space-y-2"><Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={2} /></div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2"><Label>Current Billing ($)</Label><Input type="number" step="0.01" value={formCurrentBilled} onChange={e => setFormCurrentBilled(e.target.value)} /></div>
              <div className="space-y-2"><Label>Retainage ($)</Label><Input type="number" step="0.01" value={formRetainage} onChange={e => setFormRetainage(e.target.value)} /></div>
              <div className="space-y-2"><Label>Vendor</Label><Input value={formVendorName} onChange={e => setFormVendorName(e.target.value)} /></div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Period From</Label><Input type="date" value={formPeriodFrom} onChange={e => setFormPeriodFrom(e.target.value)} /></div>
              <div className="space-y-2"><Label>Period To</Label><Input type="date" value={formPeriodTo} onChange={e => setFormPeriodTo(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingInvoice ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Invoice</DialogTitle><DialogDescription>Are you sure? This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteTarget) deleteMutation.mutate({ projectId: deleteTarget.projectId, invoiceId: deleteTarget.id }, { onSuccess: () => setDeleteTarget(null) }); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
