import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProjectComment } from "@shared/schema";

export function useProjectComments(projectId: number) {
  return useQuery<ProjectComment[]>({
    queryKey: ['/api/projects', projectId, 'comments'],
    enabled: !!projectId,
  });
}

export function useCreateProjectComment(projectId: number) {
  return useMutation({
    mutationFn: async (data: { content: string; parentId?: number }) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/comments`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'comments'] });
    },
  });
}

export function useDeleteProjectComment(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/comments/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'comments'] });
    },
  });
}
