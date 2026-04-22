import { useState, useMemo } from "react";
import { useConstructionInvoices, useContractSummary, useInvoiceAgingReport, useRecordPayment, useCreateConstructionInvoice, useUpdateConstructionInvoice, useDeleteConstructionInvoice } from "@/hooks/use-construction-invoices";
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
import { Loader2, Search, Plus, Trash2, MoreVertical, Pencil, Receipt, DollarSign, CheckCircle, Clock, TrendingUp, FileText, BarChart3, CreditCard, AlertTriangle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn, normalizeSearch } from "@/lib/utils";
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

type LineItemData = {
  costCode: string;
  description: string;
  scheduledValue: string;
  previousBilled: string;
  currentBilled: string;
  balanceToFinish: string;
  percentComplete: string;
};

function emptyLineItem(): LineItemData {
  return { costCode: "", description: "", scheduledValue: "0", previousBilled: "0", currentBilled: "0", balanceToFinish: "0", percentComplete: "0" };
}

export default function ConstructionInvoicesTab({ projectId }: { projectId: number }) {
  const { data: invoices, isLoading } = useConstructionInvoices(projectId);
  const { data: contractSummary } = useContractSummary(projectId);
  const { data: agingReport } = useInvoiceAgingReport(projectId);
  const createMutation = useCreateConstructionInvoice();
  const updateMutation = useUpdateConstructionInvoice();
  const deleteMutation = useDeleteConstructionInvoice();
  const recordPaymentMutation = useRecordPayment();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<ConstructionInvoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConstructionInvoice | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "aging">("list");
  const [paymentTarget, setPaymentTarget] = useState<ConstructionInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState<string>("Draft");
  const [formCurrentBilled, setFormCurrentBilled] = useState("");
  const [formRetainage, setFormRetainage] = useState("");
  const [formPeriodFrom, setFormPeriodFrom] = useState("");
  const [formPeriodTo, setFormPeriodTo] = useState("");
  const [formVendorName, setFormVendorName] = useState("");
  const [formVendorEmail, setFormVendorEmail] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLineItems, setFormLineItems] = useState<LineItemData[]>([emptyLineItem()]);

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormStatus("Draft");
    setFormCurrentBilled("");
    setFormRetainage("");
    setFormPeriodFrom("");
    setFormPeriodTo("");
    setFormVendorName("");
    setFormVendorEmail("");
    setFormNotes("");
    setFormLineItems([emptyLineItem()]);
    setEditingInvoice(null);
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = async (inv: ConstructionInvoice) => {
    setEditingInvoice(inv);
    setFormTitle(inv.title);
    setFormDescription(inv.description || "");
    setFormStatus(inv.status);
    setFormCurrentBilled(inv.currentBilled || "");
    setFormRetainage(inv.retainage || "");
    setFormPeriodFrom(inv.periodFrom || "");
    setFormPeriodTo(inv.periodTo || "");
    setFormVendorName(inv.vendorName || "");
    setFormVendorEmail(inv.vendorEmail || "");
    setFormNotes(inv.notes || "");
    setFormLineItems([emptyLineItem()]);
    setIsDialogOpen(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/construction-invoices/${inv.id}`);
      if (res.ok) {
        const detail = await res.json();
        if (detail.lineItems && detail.lineItems.length > 0) {
          setFormLineItems(detail.lineItems.map((li: Record<string, unknown>) => ({
            costCode: (li.costCode as string) || "",
            description: (li.description as string) || "",
            scheduledValue: String(li.scheduledValue || "0"),
            previousBilled: String(li.previousBilled || "0"),
            currentBilled: String(li.currentBilled || "0"),
            balanceToFinish: String(li.balanceToFinish || "0"),
            percentComplete: String(li.percentComplete || "0"),
          })));
        }
      }
    } catch {
      // line items fail silently, user can still edit invoice fields
    }
  };

  const handleSubmit = () => {
    if (!formTitle.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    const validLineItems = formLineItems.filter(li => li.description.trim());
    const data: Record<string, unknown> = {
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      status: formStatus,
      currentBilled: formCurrentBilled || null,
      retainage: formRetainage || null,
      periodFrom: formPeriodFrom || null,
      periodTo: formPeriodTo || null,
      vendorName: formVendorName || null,
      vendorEmail: formVendorEmail || null,
      notes: formNotes || null,
      lineItems: validLineItems.length > 0 ? validLineItems : undefined,
    };

    if (editingInvoice) {
      updateMutation.mutate({ projectId, invoiceId: editingInvoice.id, data }, {
        onSuccess: () => { setIsDialogOpen(false); resetForm(); },
      });
    } else {
      createMutation.mutate({ projectId, data }, {
        onSuccess: () => { setIsDialogOpen(false); resetForm(); },
      });
    }
  };

  const updateLineItem = (index: number, field: keyof LineItemData, value: string) => {
    const updated = [...formLineItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "scheduledValue" || field === "previousBilled" || field === "currentBilled") {
      const scheduled = parseFloat(updated[index].scheduledValue) || 0;
      const prev = parseFloat(updated[index].previousBilled) || 0;
      const curr = parseFloat(updated[index].currentBilled) || 0;
      updated[index].balanceToFinish = String(scheduled - prev - curr);
      updated[index].percentComplete = scheduled > 0 ? String(Math.round(((prev + curr) / scheduled) * 100)) : "0";
    }
    setFormLineItems(updated);
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

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {contractSummary && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Original Contract</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(contractSummary.originalContract)}</div>
                <p className="text-xs text-muted-foreground mt-1">Changes: {formatCurrency(contractSummary.approvedChanges)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Revised Contract</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(contractSummary.revisedContract)}</div>
                <p className="text-xs text-muted-foreground mt-1">{contractSummary.percentBilled}% billed</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Billed</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(contractSummary.totalBilled)}</div>
                <p className="text-xs text-muted-foreground mt-1">Paid: {formatCurrency(contractSummary.totalPaid)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Balance Remaining</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(contractSummary.balanceRemaining)}</div>
                <p className="text-xs text-muted-foreground mt-1">{contractSummary.pendingInvoices} pending</p>
              </CardContent>
            </Card>
          </div>
          {contractSummary.revisedContract > 0 && (
            <div className="px-1">
              <div className="flex justify-between text-sm text-muted-foreground mb-1">
                <span>Billing Progress</span>
                <span>{contractSummary.percentBilled}%</span>
              </div>
              <Progress value={contractSummary.percentBilled} className="h-2" />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")}>
          <FileText className="mr-2 h-4 w-4" />List
        </Button>
        <Button variant={viewMode === "aging" ? "default" : "outline"} size="sm" onClick={() => setViewMode("aging")}>
          <BarChart3 className="mr-2 h-4 w-4" />Aging Report
        </Button>
      </div>

      {viewMode === "aging" && agingReport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoice Aging Report</CardTitle>
            <p className="text-sm text-muted-foreground">Generated {format(new Date(agingReport.generatedAt), "MMM d, yyyy h:mm a")}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Billed</p>
                <p className="text-xl font-bold">{formatCurrency(agingReport.totalBilled)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-xl font-bold text-emerald-600">{formatCurrency(agingReport.totalPaid)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className={cn("text-xl font-bold", agingReport.totalOutstanding > 0 ? "text-amber-600" : "")}>{formatCurrency(agingReport.totalOutstanding)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Invoices</p>
                <p className="text-xl font-bold">{agingReport.totalInvoices}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Aging Buckets</h4>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-left font-medium">Bucket</th>
                      <th className="p-3 text-right font-medium">Count</th>
                      <th className="p-3 text-right font-medium">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Current", key: "current" as const, color: "" },
                      { label: "1-30 Days", key: "days1to30" as const, color: "text-amber-600" },
                      { label: "31-60 Days", key: "days31to60" as const, color: "text-orange-600" },
                      { label: "61-90 Days", key: "days61to90" as const, color: "text-red-500" },
                      { label: "Over 90 Days", key: "over90" as const, color: "text-red-700 font-semibold" },
                    ].map(bucket => (
                      <tr key={bucket.key} className="border-t">
                        <td className="p-3 flex items-center gap-2">
                          {bucket.key === "over90" && agingReport.buckets[bucket.key].length > 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}
                          {bucket.label}
                        </td>
                        <td className="p-3 text-right">{agingReport.buckets[bucket.key].length}</td>
                        <td className={cn("p-3 text-right", bucket.color)}>{formatCurrency(agingReport.bucketTotals[bucket.key])}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td className="p-3">Total</td>
                      <td className="p-3 text-right">{Object.values(agingReport.buckets).reduce((s, b) => s + b.length, 0)}</td>
                      <td className="p-3 text-right">{formatCurrency(agingReport.totalOutstanding)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {Object.values(agingReport.buckets).some(b => b.length > 0) && (
              <div>
                <h4 className="text-sm font-semibold mb-3">Outstanding Invoices Detail</h4>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-3 text-left font-medium">Invoice</th>
                        <th className="p-3 text-left font-medium">Vendor</th>
                        <th className="p-3 text-left font-medium">Status</th>
                        <th className="p-3 text-left font-medium">Submitted</th>
                        <th className="p-3 text-right font-medium">Billed</th>
                        <th className="p-3 text-right font-medium">Outstanding</th>
                        <th className="p-3 text-right font-medium">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["current", "days1to30", "days31to60", "days61to90", "over90"] as const).flatMap(key =>
                        agingReport.buckets[key].map(inv => (
                          <tr key={inv.id} className="border-t">
                            <td className="p-3">{inv.invoiceNumber || inv.title}</td>
                            <td className="p-3">{inv.vendorName || "-"}</td>
                            <td className="p-3"><Badge className={statusColors[inv.status || ""]}>{inv.status}</Badge></td>
                            <td className="p-3 text-xs">{inv.submittedDate || "-"}</td>
                            <td className="p-3 text-right">{formatCurrency(inv.currentBilled)}</td>
                            <td className="p-3 text-right font-medium">{formatCurrency(inv.outstanding)}</td>
                            <td className={cn("p-3 text-right", inv.daysOld > 90 ? "text-red-600 font-semibold" : inv.daysOld > 60 ? "text-orange-600" : inv.daysOld > 30 ? "text-amber-600" : "")}>{inv.daysOld}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {viewMode === "list" && <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-lg">Payment Applications</CardTitle>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
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
              <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Invoice</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No invoices found</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {search || statusFilter !== "all" ? "Try adjusting your filters" : "Create your first payment application to get started"}
              </p>
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
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                        {inv.vendorName && <span>{inv.vendorName}</span>}
                        {inv.periodFrom && inv.periodTo && (
                          <>
                            <span className="text-muted-foreground/50">|</span>
                            <span>{format(new Date(inv.periodFrom + "T00:00:00"), "MMM d")} - {format(new Date(inv.periodTo + "T00:00:00"), "MMM d, yyyy")}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 pl-[52px] sm:pl-0">
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(inv.currentBilled)}</div>
                    </div>
                    <Badge className={cn("whitespace-nowrap", statusColors[inv.status])}>{inv.status}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(inv)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        {inv.status === "Draft" && (
                          <DropdownMenuItem onClick={() => updateMutation.mutate({ projectId, invoiceId: inv.id, data: { status: "Submitted" } })}>
                            <FileText className="mr-2 h-4 w-4" />Submit
                          </DropdownMenuItem>
                        )}
                        {inv.status === "Under Review" && (
                          <DropdownMenuItem onClick={() => updateMutation.mutate({ projectId, invoiceId: inv.id, data: { status: "Approved" } })}>
                            <CheckCircle className="mr-2 h-4 w-4" />Approve
                          </DropdownMenuItem>
                        )}
                        {(inv.status === "Approved" || inv.status === "Submitted" || inv.status === "Under Review") && (
                          <DropdownMenuItem onClick={() => { setPaymentTarget(inv); setPaymentAmount(inv.currentBilled || "0"); setPaymentDate(new Date().toISOString().split("T")[0]); setPaymentNotes(""); }}>
                            <CreditCard className="mr-2 h-4 w-4" />Record Payment
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(inv)}>
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}

      <Dialog open={!!paymentTarget} onOpenChange={(open) => { if (!open) setPaymentTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record payment for {paymentTarget?.title} ({paymentTarget?.invoiceNumber})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Amount *</Label>
              <Input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Payment notes..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentTarget(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!paymentTarget || !paymentAmount) return;
              recordPaymentMutation.mutate({
                projectId,
                invoiceId: paymentTarget.id,
                paidAmount: paymentAmount,
                paidDate: paymentDate || undefined,
                notes: paymentNotes || undefined,
              }, { onSuccess: () => setPaymentTarget(null) });
            }} disabled={recordPaymentMutation.isPending}>
              {recordPaymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { setIsDialogOpen(false); resetForm(); } else setIsDialogOpen(true); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? "Edit Invoice" : "New Payment Application"}</DialogTitle>
            <DialogDescription>{editingInvoice ? "Update invoice details" : "Create a new payment application / invoice"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Payment Application #1" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Invoice description..." rows={2} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Current Billing ($)</Label>
                <Input type="number" step="0.01" value={formCurrentBilled} onChange={e => setFormCurrentBilled(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Retainage ($)</Label>
                <Input type="number" step="0.01" value={formRetainage} onChange={e => setFormRetainage(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Input value={formVendorName} onChange={e => setFormVendorName(e.target.value)} placeholder="Vendor name" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Period From</Label>
                <Input type="date" value={formPeriodFrom} onChange={e => setFormPeriodFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Period To</Label>
                <Input type="date" value={formPeriodTo} onChange={e => setFormPeriodTo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Vendor Email</Label>
                <Input type="email" value={formVendorEmail} onChange={e => setFormVendorEmail(e.target.value)} placeholder="vendor@email.com" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line Items (Schedule of Values)</Label>
                <Button variant="outline" size="sm" onClick={() => setFormLineItems([...formLineItems, emptyLineItem()])}>
                  <Plus className="mr-1 h-3 w-3" />Add Line
                </Button>
              </div>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-medium">Code</th>
                      <th className="text-left p-2 font-medium">Description</th>
                      <th className="text-right p-2 font-medium">Scheduled</th>
                      <th className="text-right p-2 font-medium">Prev</th>
                      <th className="text-right p-2 font-medium">Current</th>
                      <th className="text-right p-2 font-medium">Balance</th>
                      <th className="text-right p-2 font-medium">%</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formLineItems.map((li, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-1"><Input value={li.costCode} onChange={e => updateLineItem(idx, "costCode", e.target.value)} className="h-8 text-sm w-20" placeholder="01-100" /></td>
                        <td className="p-1"><Input value={li.description} onChange={e => updateLineItem(idx, "description", e.target.value)} className="h-8 text-sm" placeholder="Description" /></td>
                        <td className="p-1"><Input type="number" value={li.scheduledValue} onChange={e => updateLineItem(idx, "scheduledValue", e.target.value)} className="h-8 text-sm text-right w-24" /></td>
                        <td className="p-1"><Input type="number" value={li.previousBilled} onChange={e => updateLineItem(idx, "previousBilled", e.target.value)} className="h-8 text-sm text-right w-24" /></td>
                        <td className="p-1"><Input type="number" value={li.currentBilled} onChange={e => updateLineItem(idx, "currentBilled", e.target.value)} className="h-8 text-sm text-right w-24" /></td>
                        <td className="p-1 text-right pr-2">{formatCurrency(li.balanceToFinish)}</td>
                        <td className="p-1 text-right pr-2">{li.percentComplete}%</td>
                        <td className="p-1">
                          {formLineItems.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFormLineItems(formLineItems.filter((_, i) => i !== idx))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
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
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{deleteTarget?.title}"? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (deleteTarget) {
                deleteMutation.mutate({ projectId, invoiceId: deleteTarget.id }, {
                  onSuccess: () => setDeleteTarget(null),
                });
              }
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
