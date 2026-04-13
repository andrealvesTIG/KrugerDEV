import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { PunchItem, PunchItemPhoto } from "@shared/schema";

export function usePunchItems(projectId: number, filters?: Record<string, string>) {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
  }
  const qs = params.toString();
  return useQuery<PunchItem[]>({
    queryKey: [`/api/projects/${projectId}/punch-items`, qs],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/punch-items${qs ? `?${qs}` : ""}`);
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function usePunchItemSummary(projectId: number) {
  return useQuery<{
    total: number;
    statusCounts: Record<string, number>;
    priorityCounts: Record<string, number>;
    percentComplete: number;
  }>({
    queryKey: [`/api/projects/${projectId}/punch-items/summary`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/punch-items/summary`);
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function usePunchItem(projectId: number, punchItemId: number) {
  return useQuery<PunchItem & { photos: PunchItemPhoto[] }>({
    queryKey: [`/api/projects/${projectId}/punch-items/${punchItemId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/punch-items/${punchItemId}`);
      return res.json();
    },
    enabled: !!projectId && !!punchItemId,
  });
}

export function useCreatePunchItem(projectId: number) {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/punch-items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items/summary`] });
    },
  });
}

export function useBulkCreatePunchItems(projectId: number) {
  return useMutation({
    mutationFn: async (items: Record<string, unknown>[]) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/punch-items/bulk`, { items });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items/summary`] });
    },
  });
}

export function useUpdatePunchItem(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/punch-items/${id}`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items/summary`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items/${variables.id}`] });
    },
  });
}

export function useDeletePunchItem(projectId: number) {
  return useMutation({
    mutationFn: async (punchItemId: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/punch-items/${punchItemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items/summary`] });
    },
  });
}

export function usePunchItemPhotos(projectId: number, punchItemId: number) {
  return useQuery<PunchItemPhoto[]>({
    queryKey: [`/api/projects/${projectId}/punch-items/${punchItemId}/photos`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/punch-items/${punchItemId}/photos`);
      return res.json();
    },
    enabled: !!projectId && !!punchItemId,
  });
}

export function useAddPunchItemPhoto(projectId: number, punchItemId: number) {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/punch-items/${punchItemId}/photos`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items/${punchItemId}/photos`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items/${punchItemId}`] });
    },
  });
}

export function useDeletePunchItemPhoto(projectId: number, punchItemId: number) {
  return useMutation({
    mutationFn: async (photoId: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/punch-items/${punchItemId}/photos/${photoId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items/${punchItemId}/photos`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/punch-items/${punchItemId}`] });
    },
  });
}
