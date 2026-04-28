import { useQuery, useMutation } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProjectWorkflow } from "@shared/schema";

/**
 * Hook for listing/managing all project workflows for the current organization.
 */
export function useProjectWorkflows() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const query = useQuery<ProjectWorkflow[]>({
    queryKey: ["/api/organizations", orgId, "project-workflows"],
    enabled: !!orgId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${orgId}/project-workflows`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const createWorkflow = useMutation({
    mutationFn: async (data: { name: string; description?: string; isDefault?: boolean; creationMode?: 'dialog' | 'url'; creationUrl?: string | null }) => {
      if (!orgId) throw new Error("No organization selected");
      const res = await apiRequest("POST", `/api/organizations/${orgId}/project-workflows`, data);
      return res.json() as Promise<ProjectWorkflow>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "project-workflows"] });
    },
  });

  const updateWorkflowMeta = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; description?: string; isDefault?: boolean; isActive?: boolean; creationMode?: 'dialog' | 'url'; creationUrl?: string | null }) => {
      if (!orgId) throw new Error("No organization selected");
      const res = await apiRequest("PATCH", `/api/organizations/${orgId}/project-workflows/${id}`, data);
      return res.json() as Promise<ProjectWorkflow>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "project-workflows"] });
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: async (id: number) => {
      if (!orgId) throw new Error("No organization selected");
      await apiRequest("DELETE", `/api/organizations/${orgId}/project-workflows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "project-workflows"] });
    },
  });

  return {
    workflows: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createWorkflow,
    updateWorkflowMeta,
    deleteWorkflow,
  };
}

// Backwards-compatible re-export of the type so existing imports keep working.
export type { ProjectWorkflow };
