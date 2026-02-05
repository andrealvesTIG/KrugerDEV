import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { CreateMilestoneRequest, UpdateMilestoneRequest } from "@shared/schema";

export function useMilestones(projectId: number) {
  return useQuery({
    queryKey: [api.milestones.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.milestones.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch milestones");
      return api.milestones.list.responses[200].parse(await res.json());
    },
    enabled: !!projectId,
  });
}

export function useCreateMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateMilestoneRequest) => {
      const res = await fetch(api.milestones.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create milestone");
      return api.milestones.create.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.milestones.list.path, data.projectId] });
    },
  });
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, ...data }: UpdateMilestoneRequest & { id: number; projectId: number }) => {
      const url = buildUrl(api.milestones.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update milestone");
      return api.milestones.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.milestones.list.path, data.projectId] });
    },
  });
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: number; projectId: number }) => {
      const url = buildUrl(api.milestones.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete milestone");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.milestones.list.path, variables.projectId] });
    },
  });
}

export function useAllMilestones(organizationId?: number) {
  return useQuery({
    queryKey: [api.milestones.listAll.path, organizationId],
    queryFn: async () => {
      const url = organizationId 
        ? `${api.milestones.listAll.path}?organizationId=${organizationId}` 
        : api.milestones.listAll.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch milestones");
      return api.milestones.listAll.responses[200].parse(await res.json());
    },
    enabled: !!organizationId,
  });
}
