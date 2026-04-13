import { useState, useMemo } from "react";
import { useChangeOrders, useChangeOrderSummary, useChangeOrderReport, useCreateChangeOrder, useUpdateChangeOrder, useDeleteChangeOrder, usePromoteChangeOrder, useApproveChangeOrder } from "@/hooks/use-change-orders";
import type { ChangeOrder } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Plus, Trash2, MoreVertical, Pencil, ArrowRight, CheckCircle, DollarSign, Clock, FileText, TrendingUp, ArrowUpRight, BarChart3 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn, normalizeSearch } from "@/lib/utils";
import { format } from "date-fns";

const TIERS = ["PCO", "COR", "CO"] as const;
const STATUSES = ["Draft", "Pending", "Under Review", "Approved", "Rejected", "Void"] as const;
const REASON_CODES = [
  "Owner Request",
  "Design Error",
  "Unforeseen Conditions",
  "Value Engineering",
  "Code Requirement",
  "Scope Addition",
  "Schedule Acceleration",
  "Material Substitution",
  "Other",
];

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

type LineItemData = {
  costCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  category: string;
};

function emptyLineItem(): LineItemData {
  return { costCode: "", description: "", quantity: "1", unitPrice: "0", totalPrice: "0", category: "" };
}

export default function ChangeOrdersTab({ projectId }: { projectId: number }) {
  const { data: changeOrders, isLoading } = useChangeOrders(projectId);
  const { data: summary } = useChangeOrderSummary(projectId);
  const { data: report } = useChangeOrderReport(projectId);
  const createMutation = useCreateChangeOrder();
  const updateMutation = useUpdateChangeOrder();
  const deleteMutation = useDeleteChangeOrder();
  const promoteMutation = usePromoteChangeOrder();
  const approveMutation = useApproveChangeOrder();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCO, setEditingCO] = useState<ChangeOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChangeOrder | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "report">("list");

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTier, setFormTier] = useState<string>("PCO");
  const [formStatus, setFormStatus] = useState<string>("Draft");
  const [formReasonCode, setFormReasonCode] = useState("");
  const [formCostImpact, setFormCostImpact] = useState("");
  const [formScheduleImpact, setFormScheduleImpact] = useState("");
  const [formRequestedBy, setFormRequestedBy] = useState("");
  const [formRequestedDate, setFormRequestedDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLineItems, setFormLineItems] = useState<LineItemData[]>([emptyLineItem()]);

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormTier("PCO");
    setFormStatus("Draft");
    setFormReasonCode("");
    setFormCostImpact("");
    setFormScheduleImpact("");
    setFormRequestedBy("");
    setFormRequestedDate("");
    setFormNotes("");
    setFormLineItems([emptyLineItem()]);
    setEditingCO(null);
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = (co: ChangeOrder) => {
    setEditingCO(co);
    setFormTitle(co.title);
    setFormDescription(co.description || "");
    setFormTier(co.tier);
    setFormStatus(co.status);
    setFormReasonCode(co.reasonCode || "");
    setFormCostImpact(co.costImpact || "");
    setFormScheduleImpact(String(co.scheduleImpactDays || ""));
    setFormRequestedBy(co.requestedBy || "");
    setFormRequestedDate(co.requestedDate || "");
    setFormNotes(co.notes || "");
    setFormLineItems([emptyLineItem()]);
    setIsDialogOpen(true);
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
      tier: formTier,
      status: formStatus,
      reasonCode: formReasonCode || null,
      costImpact: formCostImpact || null,
      scheduleImpactDays: formScheduleImpact ? parseInt(formScheduleImpact) : null,
      requestedBy: formRequestedBy || null,
      requestedDate: formRequestedDate || null,
      notes: formNotes || null,
      lineItems: validLineItems.length > 0 ? validLineItems : undefined,
    };

    if (editingCO) {
      updateMutation.mutate({ projectId, changeOrderId: editingCO.id, data }, {
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
    if (field === "quantity" || field === "unitPrice") {
      const qty = parseFloat(updated[index].quantity) || 0;
      const price = parseFloat(updated[index].unitPrice) || 0;
      updated[index].totalPrice = String(qty * price);
    }
    setFormLineItems(updated);
  };

  const filteredOrders = useMemo(() => {
    if (!changeOrders) return [];
    return changeOrders.filter(co => {
      const matchesSearch = normalizeSearch(co.title).includes(normalizeSearch(search)) ||
        normalizeSearch(co.changeOrderNumber || "").includes(normalizeSearch(search));
      const matchesTier = tierFilter === "all" || co.tier === tierFilter;
      const matchesStatus = statusFilter === "all" || co.status === statusFilter;
      return matchesSearch && matchesTier && matchesStatus;
    });
  }, [changeOrders, search, tierFilter, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Change Orders</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                PCO: {summary.pcoCount} | COR: {summary.corCount} | CO: {summary.coCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Approved Impact</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.approvedCostImpact)}</div>
              <p className="text-xs text-muted-foreground mt-1">{summary.approvedCount} approved</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.pendingCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Total impact: {formatCurrency(summary.totalCostImpact)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Revised Contract</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.revisedContract)}</div>
              <p className="text-xs text-muted-foreground mt-1">Original: {formatCurrency(summary.originalContract)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")}>
          <FileText className="mr-2 h-4 w-4" />List
        </Button>
        <Button variant={viewMode === "report" ? "default" : "outline"} size="sm" onClick={() => setViewMode("report")}>
          <BarChart3 className="mr-2 h-4 w-4" />Log Report
        </Button>
      </div>

      {viewMode === "report" && report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Change Order Log Report</CardTitle>
            <p className="text-sm text-muted-foreground">Generated {format(new Date(report.generatedAt), "MMM d, yyyy h:mm a")}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Original Contract</p>
                <p className="text-xl font-bold">{formatCurrency(report.originalContract)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Net Change</p>
                <p className={cn("text-xl font-bold", report.netChange > 0 ? "text-rose-600" : report.netChange < 0 ? "text-emerald-600" : "")}>{formatCurrency(report.netChange)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Revised Contract</p>
                <p className="text-xl font-bold">{formatCurrency(report.revisedContract)}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Tier Summary</h4>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-left font-medium">Tier</th>
                      <th className="p-3 text-right font-medium">Total</th>
                      <th className="p-3 text-right font-medium">Approved</th>
                      <th className="p-3 text-right font-medium">Pending</th>
                      <th className="p-3 text-right font-medium">Rejected</th>
                      <th className="p-3 text-right font-medium">Approved Cost</th>
                      <th className="p-3 text-right font-medium">Schedule (days)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.tierSummaries.map(ts => (
                      <tr key={ts.tier} className="border-t">
                        <td className="p-3"><Badge className={tierColors[ts.tier]}>{ts.tier}</Badge></td>
                        <td className="p-3 text-right">{ts.total}</td>
                        <td className="p-3 text-right">{ts.approved}</td>
                        <td className="p-3 text-right">{ts.pending}</td>
                        <td className="p-3 text-right">{ts.rejected}</td>
                        <td className="p-3 text-right">{formatCurrency(ts.approvedCostImpact)}</td>
                        <td className="p-3 text-right">{ts.totalScheduleImpact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {Object.keys(report.reasonCodeBreakdown).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3">Reason Code Breakdown</h4>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-3 text-left font-medium">Reason Code</th>
                        <th className="p-3 text-right font-medium">Count</th>
                        <th className="p-3 text-right font-medium">Total Cost Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(report.reasonCodeBreakdown).map(([code, data]) => (
                        <tr key={code} className="border-t">
                          <td className="p-3">{code}</td>
                          <td className="p-3 text-right">{data.count}</td>
                          <td className="p-3 text-right">{formatCurrency(data.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-3">Full Change Order Log ({report.log.length} entries)</h4>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-left font-medium">Number</th>
                      <th className="p-3 text-left font-medium">Tier</th>
                      <th className="p-3 text-left font-medium">Title</th>
                      <th className="p-3 text-left font-medium">Status</th>
                      <th className="p-3 text-left font-medium">Reason</th>
                      <th className="p-3 text-right font-medium">Cost Impact</th>
                      <th className="p-3 text-right font-medium">Days</th>
                      <th className="p-3 text-left font-medium">Requested By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.log.map(entry => (
                      <tr key={entry.id} className="border-t">
                        <td className="p-3 font-mono text-xs">{entry.number}</td>
                        <td className="p-3"><Badge className={tierColors[entry.tier || ""]}>{entry.tier}</Badge></td>
                        <td className="p-3 max-w-[200px] truncate">{entry.title}</td>
                        <td className="p-3"><Badge className={statusColors[entry.status || ""]}>{entry.status}</Badge></td>
                        <td className="p-3 text-xs">{entry.reasonCode || "-"}</td>
                        <td className="p-3 text-right">{formatCurrency(entry.costImpact)}</td>
                        <td className="p-3 text-right">{entry.scheduleImpactDays ?? "-"}</td>
                        <td className="p-3 text-xs">{entry.requestedBy || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === "list" && <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-lg">Change Orders</CardTitle>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
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
              <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No change orders found</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {search || tierFilter !== "all" || statusFilter !== "all" ? "Try adjusting your filters" : "Create your first change order to get started"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredOrders.map(co => (
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
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                        {co.reasonCode && <span>{co.reasonCode}</span>}
                        {co.requestedBy && (
                          <>
                            <span className="text-muted-foreground/50">|</span>
                            <span>By: {co.requestedBy}</span>
                          </>
                        )}
                        {co.requestedDate && (
                          <>
                            <span className="text-muted-foreground/50">|</span>
                            <span>{format(new Date(co.requestedDate + "T00:00:00"), "MMM d, yyyy")}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 pl-[52px] sm:pl-0">
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(co.costImpact)}</div>
                      {co.scheduleImpactDays !== null && co.scheduleImpactDays !== 0 && (
                        <div className="text-xs text-muted-foreground">{co.scheduleImpactDays > 0 ? "+" : ""}{co.scheduleImpactDays}d</div>
                      )}
                    </div>
                    <Badge className={cn("whitespace-nowrap", tierColors[co.tier])}>{co.tier}</Badge>
                    <Badge className={cn("whitespace-nowrap", statusColors[co.status])}>{co.status}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(co)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        {co.tier !== "CO" && co.status !== "Void" && (
                          <DropdownMenuItem onClick={() => promoteMutation.mutate({ projectId, changeOrderId: co.id })}>
                            <ArrowUpRight className="mr-2 h-4 w-4" />Promote to {co.tier === "PCO" ? "COR" : "CO"}
                          </DropdownMenuItem>
                        )}
                        {co.status !== "Approved" && co.status !== "Void" && (
                          <DropdownMenuItem onClick={() => approveMutation.mutate({ projectId, changeOrderId: co.id })}>
                            <CheckCircle className="mr-2 h-4 w-4" />Approve
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(co)}>
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

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { setIsDialogOpen(false); resetForm(); } else setIsDialogOpen(true); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingCO ? "Edit Change Order" : "New Change Order"}</DialogTitle>
            <DialogDescription>{editingCO ? "Update change order details" : "Create a new potential change order, change order request, or change order"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Change order title" />
              </div>
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={formTier} onValueChange={setFormTier} disabled={!!editingCO}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIERS.map(t => <SelectItem key={t} value={t}>{t} - {t === "PCO" ? "Potential Change Order" : t === "COR" ? "Change Order Request" : "Change Order"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Describe the change..." rows={3} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason Code</Label>
                <Select value={formReasonCode} onValueChange={setFormReasonCode}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {REASON_CODES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Requested By</Label>
                <Input value={formRequestedBy} onChange={e => setFormRequestedBy(e.target.value)} placeholder="Name" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Cost Impact ($)</Label>
                <Input type="number" step="0.01" value={formCostImpact} onChange={e => setFormCostImpact(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Schedule Impact (days)</Label>
                <Input type="number" value={formScheduleImpact} onChange={e => setFormScheduleImpact(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Requested Date</Label>
                <Input type="date" value={formRequestedDate} onChange={e => setFormRequestedDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button variant="outline" size="sm" onClick={() => setFormLineItems([...formLineItems, emptyLineItem()])}>
                  <Plus className="mr-1 h-3 w-3" />Add Line
                </Button>
              </div>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-medium">Cost Code</th>
                      <th className="text-left p-2 font-medium">Description</th>
                      <th className="text-right p-2 font-medium">Qty</th>
                      <th className="text-right p-2 font-medium">Unit Price</th>
                      <th className="text-right p-2 font-medium">Total</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formLineItems.map((li, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-1"><Input value={li.costCode} onChange={e => updateLineItem(idx, "costCode", e.target.value)} className="h-8 text-sm" placeholder="01-100" /></td>
                        <td className="p-1"><Input value={li.description} onChange={e => updateLineItem(idx, "description", e.target.value)} className="h-8 text-sm" placeholder="Description" /></td>
                        <td className="p-1"><Input type="number" value={li.quantity} onChange={e => updateLineItem(idx, "quantity", e.target.value)} className="h-8 text-sm text-right w-20" /></td>
                        <td className="p-1"><Input type="number" step="0.01" value={li.unitPrice} onChange={e => updateLineItem(idx, "unitPrice", e.target.value)} className="h-8 text-sm text-right w-24" /></td>
                        <td className="p-1 text-right pr-2 font-medium">{formatCurrency(li.totalPrice)}</td>
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
              {editingCO ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Change Order</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{deleteTarget?.title}"? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (deleteTarget) {
                deleteMutation.mutate({ projectId, changeOrderId: deleteTarget.id }, {
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
