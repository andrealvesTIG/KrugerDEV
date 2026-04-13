import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ChangeOrder, ChangeOrderLineItem } from "@shared/schema";

export type ChangeOrderWithLineItems = ChangeOrder & {
  lineItems: ChangeOrderLineItem[];
};

export type ChangeOrderSummary = {
  totalCount: number;
  pcoCount: number;
  corCount: number;
  coCount: number;
  approvedCount: number;
  pendingCount: number;
  approvedCostImpact: number;
  totalCostImpact: number;
  totalScheduleImpact: number;
  originalContract: number;
  revisedContract: number;
};

export type ChangeOrderReport = {
  projectName: string;
  originalContract: number;
  revisedContract: number;
  netChange: number;
  tierSummaries: Array<{
    tier: string;
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    totalCostImpact: number;
    approvedCostImpact: number;
    totalScheduleImpact: number;
  }>;
  reasonCodeBreakdown: Record<string, { count: number; totalCost: number }>;
  log: Array<ChangeOrder & { lineItems: ChangeOrderLineItem[] }>;
  generatedAt: string;
};

export function useChangeOrderReport(projectId: number | undefined) {
  return useQuery<ChangeOrderReport>({
    queryKey: [`/api/projects/${projectId}/change-orders/report`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/change-orders/report`);
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useChangeOrders(projectId: number | undefined, tier?: string) {
  const url = tier
    ? `/api/projects/${projectId}/change-orders?tier=${tier}`
    : `/api/projects/${projectId}/change-orders`;
  return useQuery<ChangeOrder[]>({
    queryKey: [`/api/projects/${projectId}/change-orders`, tier],
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch change orders");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useChangeOrderSummary(projectId: number | undefined) {
  return useQuery<ChangeOrderSummary>({
    queryKey: [`/api/projects/${projectId}/change-orders/summary`],
    enabled: !!projectId,
  });
}

export function useChangeOrder(projectId: number | undefined, changeOrderId: number | undefined) {
  return useQuery<ChangeOrderWithLineItems>({
    queryKey: [`/api/projects/${projectId}/change-orders/${changeOrderId}`],
    enabled: !!projectId && !!changeOrderId,
  });
}

export function useCreateChangeOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/change-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create change order" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/summary`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/report`] });
      toast({ title: "Change order created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateChangeOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, changeOrderId, data }: { projectId: number; changeOrderId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/change-orders/${changeOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update change order" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/summary`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/report`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/${vars.changeOrderId}`] });
      toast({ title: "Change order updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteChangeOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, changeOrderId }: { projectId: number; changeOrderId: number }) => {
      const res = await fetch(`/api/projects/${projectId}/change-orders/${changeOrderId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete change order" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/summary`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/report`] });
      toast({ title: "Change order deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function usePromoteChangeOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, changeOrderId }: { projectId: number; changeOrderId: number }) => {
      const res = await fetch(`/api/projects/${projectId}/change-orders/${changeOrderId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to promote change order" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/summary`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/report`] });
      toast({ title: "Change order promoted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useApproveChangeOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, changeOrderId, approvedBy }: { projectId: number; changeOrderId: number; approvedBy?: string }) => {
      const res = await fetch(`/api/projects/${projectId}/change-orders/${changeOrderId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedBy }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to approve change order" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/summary`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/change-orders/report`] });
      toast({ title: "Change order approved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}
