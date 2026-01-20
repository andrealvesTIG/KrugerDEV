import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BillableStatusComment } from "@shared/schema";

export function useBillableStatusComments(projectId: number) {
  return useQuery<BillableStatusComment[]>({
    queryKey: ['/api/projects', projectId, 'billable-status-comments'],
    enabled: !!projectId,
  });
}

export function useCreateBillableStatusComment(projectId: number) {
  return useMutation({
    mutationFn: async (data: { content: string }) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/billable-status-comments`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'billable-status-comments'] });
    },
  });
}
