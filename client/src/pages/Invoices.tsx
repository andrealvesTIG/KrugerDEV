import { useState, useMemo } from "react";
import { useOrganizationInvoices, useCreateInvoice, useUpdateInvoice, useDeleteInvoice } from "@/hooks/use-invoices";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Plus, Trash2, Receipt, MoreVertical, Pencil, DollarSign, TrendingUp, Clock, CheckCircle, AlertCircle, XCircle, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectInvoiceSchema, type ProjectInvoice } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn, normalizeSearch } from "@/lib/utils";
import { Link } from "wouter";
import { z } from "zod";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Overdue: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  Cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Draft: FileText,
  Sent: Clock,
  Paid: CheckCircle,
  Overdue: AlertCircle,
  Cancelled: XCircle,
};

function formatCurrency(amount: string | number | null | undefined, currency: string = "USD"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(num);
}

function StatCard({ title, value, icon: Icon, description, className }: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  className?: string;
}) {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function Invoices() {
  const { currentOrganization } = useOrganization();
  const { data: invoices, isLoading } = useOrganizationInvoices(currentOrganization?.id);
  const { data: projects } = useProjects(currentOrganization?.id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<ProjectInvoice | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const deleteInvoice = useDeleteInvoice();
  const { toast } = useToast();
  const [deleteInvoiceData, setDeleteInvoiceData] = useState<{ id: number; projectId: number } | null>(null);

  const formSchema = insertProjectInvoiceSchema.extend({
    projectId: z.number().min(1, "Please select a project"),
    title: z.string().min(1, "Title is required"),
    amount: z.string().optional(),
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectId: undefined as unknown as number,
      title: "",
      description: "",
      invoiceNumber: "",
      amount: "0",
      currency: "USD",
      status: "Draft",
      invoiceDate: "",
      dueDate: "",
      vendorName: "",
      vendorEmail: "",
    }
  });

  const editForm = useForm({
    defaultValues: {
      title: "",
      description: "",
      invoiceNumber: "",
      amount: "0",
      currency: "USD",
      status: "Draft",
      invoiceDate: "",
      dueDate: "",
      paidDate: "",
      vendorName: "",
      vendorEmail: "",
    }
  });

  const stats = useMemo(() => {
    if (!invoices) return { total: 0, totalAmount: 0, paid: 0, paidAmount: 0, pending: 0, pendingAmount: 0, overdue: 0, overdueAmount: 0 };
    
    const total = invoices.length;
    const totalAmount = invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount || "0")), 0);
    const paid = invoices.filter(inv => inv.status === "Paid");
    const paidAmount = paid.reduce((sum, inv) => sum + (parseFloat(inv.amount || "0")), 0);
    const pending = invoices.filter(inv => ["Draft", "Sent"].includes(inv.status || ""));
    const pendingAmount = pending.reduce((sum, inv) => sum + (parseFloat(inv.amount || "0")), 0);
    const overdue = invoices.filter(inv => inv.status === "Overdue");
    const overdueAmount = overdue.reduce((sum, inv) => sum + (parseFloat(inv.amount || "0")), 0);
    
    return {
      total,
      totalAmount,
      paid: paid.length,
      paidAmount,
      pending: pending.length,
      pendingAmount,
      overdue: overdue.length,
      overdueAmount,
    };
  }, [invoices]);

  const filteredInvoices = invoices?.filter(invoice => {
    const matchesSearch = normalizeSearch(invoice.title).includes(normalizeSearch(search)) ||
      normalizeSearch(invoice.invoiceNumber).includes(normalizeSearch(search)) ||
      normalizeSearch(invoice.vendorName).includes(normalizeSearch(search));
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    const matchesProject = projectFilter === "all" || invoice.projectId.toString() === projectFilter;
    return matchesSearch && matchesStatus && matchesProject;
  });

  const getProjectName = (projectId: number) => {
    return projects?.find(p => p.id === projectId)?.name || "Unknown Project";
  };

  const openEditDialog = (invoice: ProjectInvoice) => {
    setEditingInvoice(invoice);
    editForm.reset({
      title: invoice.title,
      description: invoice.description || "",
      invoiceNumber: invoice.invoiceNumber || "",
      amount: invoice.amount || "0",
      currency: invoice.currency || "USD",
      status: invoice.status || "Draft",
      invoiceDate: invoice.invoiceDate || "",
      dueDate: invoice.dueDate || "",
      paidDate: invoice.paidDate || "",
      vendorName: invoice.vendorName || "",
      vendorEmail: invoice.vendorEmail || "",
    });
    setIsEditDialogOpen(true);
  };

  const onEditSubmit = (data: any) => {
    if (!editingInvoice) return;
    updateInvoice.mutate({ 
      id: editingInvoice.id, 
      projectId: editingInvoice.projectId,
      ...data 
    }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Invoice updated successfully" });
        setIsEditDialogOpen(false);
        setEditingInvoice(null);
      },
      onError: (err: Error) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  const onSubmit = (data: any) => {
    createInvoice.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Invoice created successfully" });
        setIsDialogOpen(false);
        form.reset({
          projectId: undefined as unknown as number,
          title: "",
          description: "",
          invoiceNumber: "",
          amount: "0",
          currency: "USD",
          status: "Draft",
          invoiceDate: "",
          dueDate: "",
          vendorName: "",
          vendorEmail: "",
        });
      },
      onError: (err: Error) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleDelete = () => {
    if (!deleteInvoiceData) return;
    deleteInvoice.mutate(deleteInvoiceData, {
      onSuccess: () => {
        toast({ title: "Success", description: "Invoice deleted successfully" });
        setDeleteInvoiceData(null);
      },
      onError: (err: Error) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
            <p className="text-muted-foreground">Manage and track all invoices across your organization</p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)} data-testid="button-create-invoice">
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Total Invoices"
            value={stats.total}
            icon={Receipt}
            description={formatCurrency(stats.totalAmount)}
          />
          <StatCard
            title="Paid"
            value={stats.paid}
            icon={CheckCircle}
            description={formatCurrency(stats.paidAmount)}
            className="border-l-4 border-l-emerald-500"
          />
          <StatCard
            title="Pending"
            value={stats.pending}
            icon={Clock}
            description={formatCurrency(stats.pendingAmount)}
            className="border-l-4 border-l-blue-500"
          />
          <StatCard
            title="Overdue"
            value={stats.overdue}
            icon={AlertCircle}
            description={formatCurrency(stats.overdueAmount)}
            className="border-l-4 border-l-rose-500"
          />
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-lg">All Invoices</CardTitle>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search invoices..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 w-full md:w-[250px]"
                    data-testid="input-search-invoices"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[150px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Sent">Sent</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-full md:w-[180px]" data-testid="select-project-filter">
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects?.map(project => (
                      <SelectItem key={project.id} value={project.id.toString()}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!filteredInvoices || filteredInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">No invoices found</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {search || statusFilter !== "all" || projectFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Create your first invoice to get started"}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredInvoices.map((invoice) => {
                  const StatusIcon = statusIcons[invoice.status || "Draft"] || FileText;
                  return (
                    <div
                      key={invoice.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 gap-3"
                      data-testid={`invoice-row-${invoice.id}`}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                          <Receipt className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium truncate">{invoice.title}</h4>
                            {invoice.invoiceNumber && (
                              <span className="text-muted-foreground text-sm">#{invoice.invoiceNumber}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                            <Link href={`/projects/${invoice.projectId}`} className="hover:text-primary hover:underline">
                              {getProjectName(invoice.projectId)}
                            </Link>
                            {invoice.vendorName && (
                              <>
                                <span className="text-muted-foreground/50">•</span>
                                <span>{invoice.vendorName}</span>
                              </>
                            )}
                            {invoice.dueDate && (
                              <>
                                <span className="text-muted-foreground/50">•</span>
                                <span>Due: {format(new Date(invoice.dueDate), "MMM d, yyyy")}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 pl-[52px] sm:pl-0">
                        <div className="text-left sm:text-right">
                          <div className="font-semibold">{formatCurrency(invoice.amount, invoice.currency || "USD")}</div>
                        </div>
                        <Badge className={cn("flex items-center gap-1 whitespace-nowrap", statusColors[invoice.status || "Draft"])}>
                          <StatusIcon className="h-3 w-3" />
                          {invoice.status || "Draft"}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="shrink-0" data-testid={`button-invoice-menu-${invoice.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(invoice)} data-testid={`button-edit-invoice-${invoice.id}`}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteInvoiceData({ id: invoice.id, projectId: invoice.projectId })}
                              data-testid={`button-delete-invoice-${invoice.id}`}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Create New Invoice</DialogTitle>
            <DialogDescription>Add a new invoice to track payments and billing</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 overflow-hidden">
            <div className="space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="projectId">Project *</Label>
                <Controller
                  name="projectId"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value?.toString()} onValueChange={(v) => field.onChange(Number(v))}>
                      <SelectTrigger data-testid="select-project">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects?.map(project => (
                          <SelectItem key={project.id} value={project.id.toString()}>{project.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.projectId && (
                  <p className="text-sm text-destructive">{form.formState.errors.projectId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <Input {...form.register("invoiceNumber")} placeholder="INV-001" data-testid="input-invoice-number" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input {...form.register("title")} placeholder="Invoice title" data-testid="input-title" />
              {form.formState.errors.title && (
                <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea {...form.register("description")} placeholder="Invoice description" data-testid="input-description" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input {...form.register("amount")} type="number" step="0.01" placeholder="0.00" data-testid="input-amount" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Controller
                  name="currency"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="CAD">CAD</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Controller
                  name="status"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Sent">Sent</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Overdue">Overdue</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoiceDate">Invoice Date</Label>
                <Input {...form.register("invoiceDate")} type="date" data-testid="input-invoice-date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input {...form.register("dueDate")} type="date" data-testid="input-due-date" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vendorName">Vendor Name</Label>
                <Input {...form.register("vendorName")} placeholder="Vendor or client name" data-testid="input-vendor-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendorEmail">Vendor Email</Label>
                <Input {...form.register("vendorEmail")} type="email" placeholder="vendor@email.com" data-testid="input-vendor-email" />
              </div>
            </div>
            </div>
            <DialogFooter className="shrink-0 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createInvoice.isPending} data-testid="button-submit-invoice">
                {createInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Invoice</DialogTitle>
            <DialogDescription>Update invoice details</DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="flex flex-col gap-4 overflow-hidden">
            <div className="space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <Input {...editForm.register("invoiceNumber")} placeholder="INV-001" data-testid="input-edit-invoice-number" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Controller
                  name="status"
                  control={editForm.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-edit-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Sent">Sent</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Overdue">Overdue</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input {...editForm.register("title")} placeholder="Invoice title" data-testid="input-edit-title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea {...editForm.register("description")} placeholder="Invoice description" data-testid="input-edit-description" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input {...editForm.register("amount")} type="number" step="0.01" placeholder="0.00" data-testid="input-edit-amount" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Controller
                  name="currency"
                  control={editForm.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-edit-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="CAD">CAD</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paidDate">Paid Date</Label>
                <Input {...editForm.register("paidDate")} type="date" data-testid="input-edit-paid-date" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoiceDate">Invoice Date</Label>
                <Input {...editForm.register("invoiceDate")} type="date" data-testid="input-edit-invoice-date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input {...editForm.register("dueDate")} type="date" data-testid="input-edit-due-date" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vendorName">Vendor Name</Label>
                <Input {...editForm.register("vendorName")} placeholder="Vendor or client name" data-testid="input-edit-vendor-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendorEmail">Vendor Email</Label>
                <Input {...editForm.register("vendorEmail")} type="email" placeholder="vendor@email.com" data-testid="input-edit-vendor-email" />
              </div>
            </div>
            </div>
            <DialogFooter className="shrink-0 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateInvoice.isPending} data-testid="button-update-invoice">
                {updateInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteInvoiceData} onOpenChange={() => setDeleteInvoiceData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteInvoiceData(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteInvoice.isPending} data-testid="button-confirm-delete">
              {deleteInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
