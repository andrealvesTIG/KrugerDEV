import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProjectInvoice, InsertProjectInvoice } from "@shared/schema";

export function useProjectInvoices(projectId: number) {
  return useQuery<ProjectInvoice[]>({
    queryKey: ['/api/projects', projectId, 'invoices'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/invoices`);
      if (!res.ok) throw new Error('Failed to fetch project invoices');
      return res.json();
    },
    enabled: projectId > 0,
  });
}

export function useOrganizationInvoices(organizationId: number | null | undefined) {
  return useQuery<ProjectInvoice[]>({
    queryKey: ['/api/organizations', organizationId, 'invoices'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/invoices`);
      if (!res.ok) throw new Error('Failed to fetch organization invoices');
      return res.json();
    },
    enabled: !!organizationId,
  });
}

export function useCreateInvoice() {
  return useMutation({
    mutationFn: async ({ projectId, ...data }: InsertProjectInvoice & { projectId: number }) => {
      const res = await fetch(`/api/projects/${projectId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Failed to create invoice' }));
        throw new Error(errorData.message || 'Failed to create invoice');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'], exact: false });
    },
  });
}

export function useUpdateInvoice() {
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; projectId?: number } & Partial<ProjectInvoice>) =>
      apiRequest('PATCH', `/api/invoices/${id}`, data),
    onSuccess: (_, variables) => {
      if (variables.projectId) {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'invoices'] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'], exact: false });
    },
  });
}

export function useDeleteInvoice() {
  return useMutation({
    mutationFn: ({ id }: { id: number; projectId?: number }) =>
      apiRequest('DELETE', `/api/invoices/${id}`),
    onSuccess: (_, variables) => {
      if (variables.projectId) {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'invoices'] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'], exact: false });
    },
  });
}
