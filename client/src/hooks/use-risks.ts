import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateRiskRequest, type UpdateRiskRequest } from "@shared/routes";

export function useRisks(projectId: number) {
  return useQuery({
    queryKey: [api.risks.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.risks.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch risks");
      return api.risks.list.responses[200].parse(await res.json());
    },
    enabled: !!projectId,
  });
}

export function useCreateRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateRiskRequest) => {
      const res = await fetch(api.risks.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create risk");
      return api.risks.create.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.risks.list.path, data.projectId] });
    },
  });
}

export function useUpdateRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, ...data }: UpdateRiskRequest & { id: number; projectId: number }) => {
      const url = buildUrl(api.risks.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update risk");
      return api.risks.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      // We need projectId to invalidate the list
      // Since response might not include it (partial update returns updated row, usually does include it though)
      // but to be safe we passed it in the mutation call
      queryClient.invalidateQueries({ queryKey: [api.risks.list.path, data.projectId] });
    },
  });
}

export function useDeleteRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: number; projectId: number }) => {
      const url = buildUrl(api.risks.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete risk");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.risks.list.path, variables.projectId] });
    },
  });
}
