import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useOrganization } from "@/hooks/use-organization";
import type { ProjectWorkflow, ProjectWorkflowStep } from "@shared/schema";

/**
 * Hook for listing/managing all project workflows for the current organization.
 */
export function useProjectWorkflows() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const query = useQuery<ProjectWorkflow[]>({
    queryKey: ['/api/organizations', orgId, 'project-workflows'],
    enabled: !!orgId,
  });

  const createWorkflow = useMutation({
    mutationFn: async (data: { name: string; description?: string; isDefault?: boolean }) => {
      if (!orgId) throw new Error("No organization selected");
      const res = await apiRequest("POST", `/api/organizations/${orgId}/project-workflows`, data);
      return res.json() as Promise<ProjectWorkflow>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'project-workflows'] });
    },
  });

  const updateWorkflowMeta = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; description?: string; isDefault?: boolean; isActive?: boolean }) => {
      if (!orgId) throw new Error("No organization selected");
      const res = await apiRequest("PATCH", `/api/organizations/${orgId}/project-workflows/${id}`, data);
      return res.json() as Promise<ProjectWorkflow>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'project-workflows'] });
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: async (id: number) => {
      if (!orgId) throw new Error("No organization selected");
      await apiRequest("DELETE", `/api/organizations/${orgId}/project-workflows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'project-workflows'] });
    },
  });

  return {
    workflows: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    createWorkflow,
    updateWorkflowMeta,
    deleteWorkflow,
  };
}

/**
 * Hook for fetching the steps of a specific project workflow (or org default).
 */
export function useProjectWorkflowSteps(workflowId?: number | null) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const queryKey = workflowId
    ? ['/api/organizations', orgId, 'project-workflow', { workflowId }]
    : ['/api/organizations', orgId, 'project-workflow'];

  const url = workflowId
    ? `/api/organizations/${orgId}/project-workflow?workflowId=${workflowId}`
    : `/api/organizations/${orgId}/project-workflow`;

  const query = useQuery<ProjectWorkflowStep[]>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: !!orgId,
  });

  return {
    steps: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
