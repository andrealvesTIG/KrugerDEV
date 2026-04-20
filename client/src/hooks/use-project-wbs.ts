import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { MultiYearWbs, InsertMultiYearWbs } from "@shared/schema";

export function useProjectWbs(projectId: number | undefined) {
  return useQuery<MultiYearWbs[]>({
    queryKey: ["/api/projects", projectId, "wbs"],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/projects/${projectId}/wbs`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch WBS");
      return response.json();
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectWbs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Partial<InsertMultiYearWbs> }) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/wbs`, data);
      return response.json();
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "wbs"] });
    },
  });
}

export function useUpdateProjectWbs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data, projectId: _projectId }: { id: number; data: Partial<InsertMultiYearWbs>; projectId: number }) => {
      const response = await apiRequest("PATCH", `/api/wbs/${id}`, data);
      return response.json();
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "wbs"] });
    },
  });
}

export function useDeleteProjectWbs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId: _projectId }: { id: number; projectId: number }) => {
      const response = await apiRequest("DELETE", `/api/wbs/${id}`);
      return response.json();
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "wbs"] });
    },
  });
}
