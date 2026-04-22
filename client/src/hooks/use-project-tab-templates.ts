import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type {
  ProjectTabTemplate,
  ProjectTabTemplateTab,
  ProjectTabTemplateSection,
  ProjectTabTemplateField,
} from "@shared/schema";

export type FullTemplateField = ProjectTabTemplateField;
export type FullTemplateSection = ProjectTabTemplateSection & { fields: FullTemplateField[] };
export type FullTemplateTab = ProjectTabTemplateTab & { sections: FullTemplateSection[] };
export type FullProjectTabTemplate = { template: ProjectTabTemplate; tabs: FullTemplateTab[] };

export function useProjectTabTemplates(organizationId: number | undefined, industry?: string) {
  return useQuery<ProjectTabTemplate[]>({
    queryKey: ['/api/project-tab-templates', organizationId, industry ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (organizationId) params.set('organizationId', String(organizationId));
      if (industry && industry !== 'all') params.set('industry', industry);
      const qs = params.toString();
      const res = await apiRequest('GET', `/api/project-tab-templates${qs ? `?${qs}` : ''}`);
      return res.json();
    },
    enabled: !!organizationId,
  });
}

export function useSystemProjectTabTemplates(enabled: boolean = true, industry?: string) {
  return useQuery<ProjectTabTemplate[]>({
    queryKey: ['/api/project-tab-templates', 'system', industry ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (industry && industry !== 'all') params.set('industry', industry);
      const qs = params.toString();
      const res = await apiRequest('GET', `/api/project-tab-templates${qs ? `?${qs}` : ''}`);
      return res.json();
    },
    enabled,
  });
}

export function useFullProjectTabTemplate(id: number | undefined, organizationId?: number) {
  return useQuery<FullProjectTabTemplate>({
    queryKey: ['/api/project-tab-templates', id, 'full', organizationId],
    queryFn: async () => {
      const url = organizationId
        ? `/api/project-tab-templates/${id}/full?organizationId=${organizationId}`
        : `/api/project-tab-templates/${id}/full`;
      const res = await apiRequest('GET', url);
      return res.json();
    },
    enabled: !!id,
  });
}

export type CanonicalTemplateLayout = { order: string[]; hidden: string[] };

export function useTemplateLayout(id: number | undefined) {
  return useQuery<CanonicalTemplateLayout>({
    queryKey: ['/api/project-tab-templates', id, 'layout'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/project-tab-templates/${id}/layout`);
      return res.json();
    },
    enabled: !!id,
  });
}

export function useUpdateTemplateLayout() {
  return useMutation({
    mutationFn: async ({ id, order, hidden }: { id: number; order: string[]; hidden: string[] }) => {
      const res = await apiRequest('PUT', `/api/project-tab-templates/${id}/layout`, { order, hidden });
      return res.json() as Promise<CanonicalTemplateLayout>;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates', vars.id, 'layout'] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates', vars.id, 'full'] });
    },
  });
}

export function useUpdateProjectTabTemplate() {
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; name?: string; description?: string; industry?: string; icon?: string; isPublished?: boolean }) => {
      const res = await apiRequest('PUT', `/api/project-tab-templates/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates'] });
    },
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
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${variables.organizationId}/project-tab-settings`] });
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

export function useCreateProjectTabTemplate() {
  return useMutation({
    mutationFn: async (body: { name: string; description?: string; industry?: string; icon?: string; scope?: 'system' | 'org'; organizationId?: number; isPublished?: boolean }) => {
      const res = await apiRequest('POST', '/api/project-tab-templates', body);
      return res.json() as Promise<ProjectTabTemplate>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates'] });
    },
  });
}

function invalidateAll(templateId?: number) {
  queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates'] });
  if (templateId) queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates', templateId, 'full'] });
}

export function useCreateTemplateTab() {
  return useMutation({
    mutationFn: async ({ templateId, ...body }: { templateId: number; name: string; description?: string; icon?: string }) => {
      const res = await apiRequest('POST', `/api/project-tab-templates/${templateId}/tabs`, body);
      return res.json();
    },
    onSuccess: (_d, v) => invalidateAll(v.templateId),
  });
}

export function useUpdateTemplateTab() {
  return useMutation({
    mutationFn: async ({ tabId, templateId, ...body }: { tabId: number; templateId: number; name?: string; description?: string | null; icon?: string | null; displayOrder?: number }) => {
      const res = await apiRequest('PUT', `/api/project-tab-templates/tabs/${tabId}`, body);
      return res.json();
    },
    onSuccess: (_d, v) => invalidateAll(v.templateId),
  });
}

export function useDeleteTemplateTab() {
  return useMutation({
    mutationFn: async ({ tabId }: { tabId: number; templateId: number }) => {
      await apiRequest('DELETE', `/api/project-tab-templates/tabs/${tabId}`);
    },
    onSuccess: (_d, v) => invalidateAll(v.templateId),
  });
}

export function useCreateTemplateSection() {
  return useMutation({
    mutationFn: async ({ tabId, templateId, ...body }: { tabId: number; templateId: number; name: string; description?: string; columns?: number }) => {
      const res = await apiRequest('POST', `/api/project-tab-templates/tabs/${tabId}/sections`, body);
      return res.json();
    },
    onSuccess: (_d, v) => invalidateAll(v.templateId),
  });
}

export function useUpdateTemplateSection() {
  return useMutation({
    mutationFn: async ({ sectionId, templateId, ...body }: { sectionId: number; templateId: number; name?: string; description?: string | null; columns?: number; displayOrder?: number }) => {
      const res = await apiRequest('PUT', `/api/project-tab-templates/sections/${sectionId}`, body);
      return res.json();
    },
    onSuccess: (_d, v) => invalidateAll(v.templateId),
  });
}

export function useDeleteTemplateSection() {
  return useMutation({
    mutationFn: async ({ sectionId }: { sectionId: number; templateId: number }) => {
      await apiRequest('DELETE', `/api/project-tab-templates/sections/${sectionId}`);
    },
    onSuccess: (_d, v) => invalidateAll(v.templateId),
  });
}

export function useCreateTemplateField() {
  return useMutation({
    mutationFn: async ({ sectionId, templateId, ...body }: { sectionId: number; templateId: number; fieldKey: string; fieldType?: string; label?: string; span?: number; isRequired?: boolean }) => {
      const res = await apiRequest('POST', `/api/project-tab-templates/sections/${sectionId}/fields`, body);
      return res.json();
    },
    onSuccess: (_d, v) => invalidateAll(v.templateId),
  });
}

export function useUpdateTemplateField() {
  return useMutation({
    mutationFn: async ({ fieldId, templateId, ...body }: { fieldId: number; templateId: number; fieldKey?: string; fieldType?: string; label?: string | null; span?: number; isRequired?: boolean; displayOrder?: number }) => {
      const res = await apiRequest('PUT', `/api/project-tab-templates/fields/${fieldId}`, body);
      return res.json();
    },
    onSuccess: (_d, v) => invalidateAll(v.templateId),
  });
}

export function useDeleteTemplateField() {
  return useMutation({
    mutationFn: async ({ fieldId }: { fieldId: number; templateId: number }) => {
      await apiRequest('DELETE', `/api/project-tab-templates/fields/${fieldId}`);
    },
    onSuccess: (_d, v) => invalidateAll(v.templateId),
  });
}

export function useDeleteProjectTabTemplate() {
  return useMutation({
    mutationFn: async ({ id }: { id: number; organizationId?: number }) => {
      await apiRequest('DELETE', `/api/project-tab-templates/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates', 'system'] });
      if (variables.organizationId !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['/api/project-tab-templates', variables.organizationId] });
      }
    },
  });
}
