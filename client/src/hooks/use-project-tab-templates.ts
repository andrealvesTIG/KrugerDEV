import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProjectTabTemplate } from "@shared/schema";

export function useProjectTabTemplates(organizationId: number | undefined) {
  return useQuery<ProjectTabTemplate[]>({
    queryKey: ['/api/project-tab-templates', organizationId],
    queryFn: async () => {
      const url = organizationId
        ? `/api/project-tab-templates?organizationId=${organizationId}`
        : '/api/project-tab-templates';
      const res = await apiRequest('GET', url);
      return res.json();
    },
    enabled: !!organizationId,
  });
}

export function useApplyTemplate() {
  return useMutation({
    mutationFn: async ({ templateId, organizationId, mode }: { templateId: number; organizationId: number; mode: 'append' | 'replace' }) => {
      const res = await apiRequest('POST', `/api/project-tab-templates/${templateId}/apply`, { organizationId, mode });
      return res.json() as Promise<{ tabsCreated: number; fieldsSkipped: number }>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${variables.organizationId}/custom-tabs`] });
    },
  });
}

export function useSaveOrgAsTemplate() {
  return useMutation({
    mutationFn: async ({ organizationId, name, description, industry, scope }: { organizationId: number; name: string; description?: string; industry?: string; scope: 'system' | 'org' }) => {
      const res = await apiRequest('POST', `/api/organizations/${organizationId}/save-tabs-as-template`, { name, description, industry, scope });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates', variables.organizationId] });
    },
  });
}

export function useDeleteProjectTabTemplate() {
  return useMutation({
    mutationFn: async ({ id }: { id: number; organizationId?: number }) => {
      await apiRequest('DELETE', `/api/project-tab-templates/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates', variables.organizationId] });
    },
  });
}
