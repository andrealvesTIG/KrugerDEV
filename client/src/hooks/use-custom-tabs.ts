import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { 
  CustomProjectTab, 
  InsertCustomProjectTab,
  CustomTabSection,
  InsertCustomTabSection,
  CustomTabField,
  InsertCustomTabField
} from "@shared/schema";

export function useCustomProjectTabs(organizationId: number | undefined) {
  return useQuery<CustomProjectTab[]>({
    queryKey: [`/api/organizations/${organizationId}/custom-tabs`],
    enabled: !!organizationId,
  });
}

export function useFullCustomTab(tabId: number | undefined) {
  return useQuery<{ 
    tab: CustomProjectTab; 
    sections: (CustomTabSection & { fields: CustomTabField[] })[] 
  }>({
    queryKey: [`/api/custom-tabs/${tabId}/full`],
    enabled: !!tabId,
  });
}

export function useCreateCustomTab() {
  return useMutation({
    mutationFn: async ({ organizationId, ...data }: InsertCustomProjectTab & { organizationId: number }) => {
      const res = await apiRequest("POST", `/api/organizations/${organizationId}/custom-tabs`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${variables.organizationId}/custom-tabs`] });
    },
  });
}

export function useUpdateCustomTab() {
  return useMutation({
    mutationFn: async ({ id, organizationId, ...data }: { id: number; organizationId: number } & Partial<InsertCustomProjectTab>) => {
      const res = await apiRequest("PUT", `/api/custom-tabs/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${variables.organizationId}/custom-tabs`] });
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tabs/${variables.id}/full`] });
    },
  });
}

export function useDeleteCustomTab() {
  return useMutation({
    mutationFn: async ({ id, organizationId }: { id: number; organizationId: number }) => {
      await apiRequest("DELETE", `/api/custom-tabs/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${variables.organizationId}/custom-tabs`] });
    },
  });
}

export function useCustomTabSections(tabId: number | undefined) {
  return useQuery<CustomTabSection[]>({
    queryKey: [`/api/custom-tabs/${tabId}/sections`],
    enabled: !!tabId,
  });
}

export function useCreateCustomTabSection() {
  return useMutation({
    mutationFn: async ({ tabId, ...data }: InsertCustomTabSection) => {
      const res = await apiRequest("POST", `/api/custom-tabs/${tabId}/sections`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tabs/${variables.tabId}/sections`] });
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tabs/${variables.tabId}/full`] });
    },
  });
}

export function useUpdateCustomTabSection() {
  return useMutation({
    mutationFn: async ({ id, tabId, ...data }: { id: number; tabId: number } & Partial<InsertCustomTabSection>) => {
      const res = await apiRequest("PUT", `/api/custom-tab-sections/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tabs/${variables.tabId}/sections`] });
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tabs/${variables.tabId}/full`] });
    },
  });
}

export function useDeleteCustomTabSection() {
  return useMutation({
    mutationFn: async ({ id, tabId }: { id: number; tabId: number }) => {
      await apiRequest("DELETE", `/api/custom-tab-sections/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tabs/${variables.tabId}/sections`] });
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tabs/${variables.tabId}/full`] });
    },
  });
}

export function useCustomTabFields(sectionId: number | undefined) {
  return useQuery<CustomTabField[]>({
    queryKey: [`/api/custom-tab-sections/${sectionId}/fields`],
    enabled: !!sectionId,
  });
}

export function useCreateCustomTabField() {
  return useMutation({
    mutationFn: async ({ sectionId, tabId, ...data }: InsertCustomTabField & { tabId: number }) => {
      const res = await apiRequest("POST", `/api/custom-tab-sections/${sectionId}/fields`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tab-sections/${variables.sectionId}/fields`] });
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tabs/${variables.tabId}/full`] });
    },
  });
}

export function useUpdateCustomTabField() {
  return useMutation({
    mutationFn: async ({ id, sectionId, tabId, ...data }: { id: number; sectionId: number; tabId: number } & Partial<InsertCustomTabField>) => {
      const res = await apiRequest("PUT", `/api/custom-tab-fields/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tab-sections/${variables.sectionId}/fields`] });
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tabs/${variables.tabId}/full`] });
    },
  });
}

export function useDeleteCustomTabField() {
  return useMutation({
    mutationFn: async ({ id, sectionId, tabId }: { id: number; sectionId: number; tabId: number }) => {
      await apiRequest("DELETE", `/api/custom-tab-fields/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tab-sections/${variables.sectionId}/fields`] });
      queryClient.invalidateQueries({ queryKey: [`/api/custom-tabs/${variables.tabId}/full`] });
    },
  });
}

export function useProjectFieldDefinitions() {
  return useQuery<readonly { key: string; label: string; type: string }[]>({
    queryKey: ['/api/project-field-definitions'],
  });
}
