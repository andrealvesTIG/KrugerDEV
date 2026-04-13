import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ConstructionInvoice, ConstructionInvoiceLineItem } from "@shared/schema";

export type ConstructionInvoiceWithLineItems = ConstructionInvoice & {
  lineItems: ConstructionInvoiceLineItem[];
};

export type ContractSummary = {
  originalContract: number;
  approvedChanges: number;
  revisedContract: number;
  totalBilled: number;
  totalPaid: number;
  balanceRemaining: number;
  totalRetainage: number;
  invoiceCount: number;
  pendingInvoices: number;
  paidInvoices: number;
  percentBilled: number;
};

export function useConstructionInvoices(projectId: number | undefined) {
  return useQuery<ConstructionInvoice[]>({
    queryKey: [`/api/projects/${projectId}/construction-invoices`],
    enabled: !!projectId,
  });
}

export function useContractSummary(projectId: number | undefined) {
  return useQuery<ContractSummary>({
    queryKey: [`/api/projects/${projectId}/construction-invoices/contract-summary`],
    enabled: !!projectId,
  });
}

export function useConstructionInvoice(projectId: number | undefined, invoiceId: number | undefined) {
  return useQuery<ConstructionInvoiceWithLineItems>({
    queryKey: [`/api/projects/${projectId}/construction-invoices/${invoiceId}`],
    enabled: !!projectId && !!invoiceId,
  });
}

export function useCreateConstructionInvoice() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/construction-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create invoice" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/construction-invoices`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/construction-invoices/contract-summary`] });
      toast({ title: "Invoice created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateConstructionInvoice() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, invoiceId, data }: { projectId: number; invoiceId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/construction-invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update invoice" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/construction-invoices`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/construction-invoices/contract-summary`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/construction-invoices/${vars.invoiceId}`] });
      toast({ title: "Invoice updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteConstructionInvoice() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, invoiceId }: { projectId: number; invoiceId: number }) => {
      const res = await fetch(`/api/projects/${projectId}/construction-invoices/${invoiceId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete invoice" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/construction-invoices`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/construction-invoices/contract-summary`] });
      toast({ title: "Invoice deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}
