import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CustomFieldDefinition, ProjectCustomFieldValue, TaskCustomFieldValue, ResourceCustomFieldValue, InsertCustomFieldDefinition } from "@shared/schema";

export function useCustomFieldDefinitions(organizationId: number | undefined | null) {
  return useQuery<CustomFieldDefinition[]>({
    queryKey: [`/api/organizations/${organizationId}/custom-fields`],
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
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${variables.organizationId}/custom-fields`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${variables.organizationId}/custom-fields`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${variables.organizationId}/custom-fields`] });
    },
  });
}

export function useProjectCustomFieldValues(projectId: number | undefined | null) {
  return useQuery<ProjectCustomFieldValue[]>({
    queryKey: [`/api/projects/${projectId}/custom-field-values`],
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
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/custom-field-values`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/custom-field-values`] });
    },
  });
}

export function useTaskCustomFieldValues(taskId: number | undefined | null) {
  return useQuery<TaskCustomFieldValue[]>({
    queryKey: [`/api/tasks/${taskId}/custom-field-values`],
    enabled: !!taskId,
  });
}

export function useUpdateTaskCustomFieldValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, fieldDefinitionId, value }: { taskId: number; fieldDefinitionId: number; value: string | null }) => {
      const res = await fetch(`/api/tasks/${taskId}/custom-field-values/${fieldDefinitionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update task custom field value");
      return res.json() as Promise<TaskCustomFieldValue>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/tasks/${variables.taskId}/custom-field-values`] });
    },
  });
}

export function useResourceCustomFieldValues(resourceId: number | undefined | null) {
  return useQuery<ResourceCustomFieldValue[]>({
    queryKey: [`/api/resources/${resourceId}/custom-field-values`],
    enabled: !!resourceId,
  });
}

export function useUpdateResourceCustomFieldValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resourceId, fieldDefinitionId, value }: { resourceId: number; fieldDefinitionId: number; value: string | null }) => {
      const res = await fetch(`/api/resources/${resourceId}/custom-field-values/${fieldDefinitionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update resource custom field value");
      return res.json() as Promise<ResourceCustomFieldValue>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/resources/${variables.resourceId}/custom-field-values`] });
    },
  });
}
