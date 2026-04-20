import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProjectView } from "@shared/schema";

export function useProjectViews(organizationId: number | null, mode: 'grid' | 'gantt' | 'list', portfolioId: number | null = null) {
  return useQuery<ProjectView[]>({
    queryKey: ['/api/organizations', organizationId, 'project-views', mode, { portfolioId }],
    queryFn: async () => {
      if (!organizationId) return [];
      const params = new URLSearchParams({ mode });
      if (portfolioId !== null) params.set('portfolioId', String(portfolioId));
      const res = await fetch(`/api/organizations/${organizationId}/project-views?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch views');
      return res.json();
    },
    enabled: !!organizationId,
  });
}

export function useCreateProjectView(organizationId: number | null, portfolioId: number | null = null) {
  return useMutation({
    mutationFn: async (data: {
      mode: 'grid' | 'gantt' | 'list';
      name: string;
      visibleColumns: string[];
      columnOrder?: string[];
      columnWidths?: Record<string, number>;
      frozenColumns?: string[];
      isDefault?: boolean;
    }) => {
      if (!organizationId) throw new Error('Organization required');
      const res = await apiRequest('POST', `/api/organizations/${organizationId}/project-views`, { ...data, portfolioId });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/organizations', organizationId, 'project-views', variables.mode, { portfolioId }] 
      });
    },
  });
}

export function useUpdateProjectView() {
  return useMutation({
    mutationFn: async ({ 
      viewId, 
      organizationId,
      mode,
      portfolioId,
      ...data 
    }: {
      viewId: number;
      organizationId: number;
      mode: 'grid' | 'gantt' | 'list';
      portfolioId?: number | null;
      name?: string;
      visibleColumns?: string[];
      columnOrder?: string[];
      columnWidths?: Record<string, number>;
      frozenColumns?: string[];
      isDefault?: boolean;
    }) => {
      const res = await apiRequest('PATCH', `/api/project-views/${viewId}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/organizations', variables.organizationId, 'project-views', variables.mode, { portfolioId: variables.portfolioId ?? null }] 
      });
    },
  });
}

export function useDeleteProjectView() {
  return useMutation({
    mutationFn: async ({ 
      viewId, 
      organizationId,
      mode,
      portfolioId,
    }: {
      viewId: number;
      organizationId: number;
      mode: 'grid' | 'gantt' | 'list';
      portfolioId?: number | null;
    }) => {
      const res = await apiRequest('DELETE', `/api/project-views/${viewId}`);
      if (!res.ok) throw new Error('Failed to delete view');
      return;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/organizations', variables.organizationId, 'project-views', variables.mode, { portfolioId: variables.portfolioId ?? null }] 
      });
    },
  });
}

export function useSetDefaultView() {
  return useMutation({
    mutationFn: async ({ 
      viewId, 
      organizationId,
      mode,
      portfolioId,
    }: {
      viewId: number;
      organizationId: number;
      mode: 'grid' | 'gantt' | 'list';
      portfolioId?: number | null;
    }) => {
      const res = await apiRequest('POST', `/api/project-views/${viewId}/set-default`);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/organizations', variables.organizationId, 'project-views', variables.mode, { portfolioId: variables.portfolioId ?? null }] 
      });
    },
  });
}
