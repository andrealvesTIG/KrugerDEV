import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CustomFieldDefinition, ProjectCustomFieldValue, InsertCustomFieldDefinition } from "@shared/schema";

export function useCustomFieldDefinitions(organizationId: number | undefined | null) {
  return useQuery<CustomFieldDefinition[]>({
    queryKey: ['/api/organizations', organizationId, 'custom-fields'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/custom-fields`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch custom field definitions");
      return res.json();
    },
    enabled: !!organizationId,
  });
}

export function useCreateCustomFieldDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, ...data }: Omit<InsertCustomFieldDefinition, 'organizationId'> & { organizationId: number }) => {
      const res = await fetch(`/api/organizations/${organizationId}/custom-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create custom field");
      return res.json() as Promise<CustomFieldDefinition>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'custom-fields'] });
    },
  });
}

export function useUpdateCustomFieldDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, organizationId, ...data }: Partial<CustomFieldDefinition> & { id: number; organizationId: number }) => {
      const res = await fetch(`/api/custom-fields/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update custom field");
      return res.json() as Promise<CustomFieldDefinition>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'custom-fields'] });
    },
  });
}

export function useDeleteCustomFieldDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, organizationId }: { id: number; organizationId: number }) => {
      const res = await fetch(`/api/custom-fields/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete custom field");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'custom-fields'] });
    },
  });
}

export function useProjectCustomFieldValues(projectId: number | undefined | null) {
  return useQuery<ProjectCustomFieldValue[]>({
    queryKey: ['/api/projects', projectId, 'custom-field-values'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/custom-field-values`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch custom field values");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useUpdateProjectCustomFieldValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, fieldDefinitionId, value }: { projectId: number; fieldDefinitionId: number; value: string | null }) => {
      const res = await fetch(`/api/projects/${projectId}/custom-field-values/${fieldDefinitionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update custom field value");
      return res.json() as Promise<ProjectCustomFieldValue>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'custom-field-values'] });
    },
  });
}

export function useBulkUpdateProjectCustomFieldValues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, values }: { projectId: number; values: Array<{ fieldDefinitionId: number; value: string | null }> }) => {
      const res = await fetch(`/api/projects/${projectId}/custom-field-values`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update custom field values");
      return res.json() as Promise<ProjectCustomFieldValue[]>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'custom-field-values'] });
    },
  });
}
