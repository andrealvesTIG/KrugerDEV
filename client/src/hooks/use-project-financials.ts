import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProjectFinancial, InsertProjectFinancial, UpdateProjectFinancialRequest } from "@shared/schema";

export function useProjectFinancials(projectId: number) {
  return useQuery<ProjectFinancial[]>({
    queryKey: ['/api/projects', projectId, 'financials'],
    enabled: !!projectId,
  });
}

export function useCreateProjectFinancial(projectId: number) {
  return useMutation({
    mutationFn: async (financial: Omit<InsertProjectFinancial, 'projectId'>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/financials`, financial);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'financials'] });
    },
  });
}

export function useUpdateProjectFinancial(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateProjectFinancialRequest) => {
      const res = await apiRequest("PUT", `/api/project-financials/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'financials'] });
    },
  });
}

export function useDeleteProjectFinancial(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/project-financials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'financials'] });
    },
  });
}
