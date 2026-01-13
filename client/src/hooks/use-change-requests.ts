import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ChangeRequest, InsertChangeRequest, UpdateChangeRequestRequest } from "@shared/schema";

export function useChangeRequests(projectId: number) {
  return useQuery<ChangeRequest[]>({
    queryKey: ['/api/projects', projectId, 'change-requests'],
    enabled: !!projectId,
  });
}

export function useCreateChangeRequest(projectId: number) {
  return useMutation({
    mutationFn: async (data: Omit<InsertChangeRequest, 'projectId' | 'requestedBy'>) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/change-requests`, data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error = new Error(errorData.message || "Failed to create change request") as any;
        error.limitExceeded = errorData.limitExceeded;
        error.resourceType = errorData.resourceType;
        throw error;
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'change-requests'] });
    },
  });
}

export function useUpdateChangeRequest(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateChangeRequestRequest }) => {
      const res = await apiRequest('PATCH', `/api/change-requests/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'change-requests'] });
    },
  });
}

export function useDeleteChangeRequest(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/change-requests/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'change-requests'] });
    },
  });
}
