import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { PmoComment } from "@shared/schema";

export type PmoCommentWithUsers = PmoComment & {
  createdByName: string | null;
  updatedByName: string | null;
};

export function useProjectPmoComments(projectId: number | undefined) {
  return useQuery<PmoCommentWithUsers[]>({
    queryKey: ["/api/projects", projectId, "pmo-comments"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pmo-comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project PMO comments");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useOrgPmoComments(organizationId: number | undefined) {
  return useQuery<PmoCommentWithUsers[]>({
    queryKey: ["/api/organizations", organizationId, "pmo-comments"],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/pmo-comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch organization PMO comments");
      return res.json();
    },
    enabled: !!organizationId,
  });
}

export function useCreateProjectPmoComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, name, comment }: { projectId: number; name: string; comment?: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/pmo-comments`, { name, comment });
      return res.json() as Promise<PmoCommentWithUsers>;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "pmo-comments"] });
      qc.invalidateQueries({ queryKey: ["/api/organizations"] });
    },
  });
}

export function useLinkPmoComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, commentId }: { projectId: number; commentId: number }) => {
      await apiRequest("POST", `/api/projects/${projectId}/pmo-comments/${commentId}/link`);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "pmo-comments"] });
    },
  });
}

export function useUnlinkPmoComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, commentId }: { projectId: number; commentId: number }) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/pmo-comments/${commentId}`);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "pmo-comments"] });
    },
  });
}

export function useUpdatePmoComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, comment }: { id: number; name?: string; comment?: string }) => {
      const res = await apiRequest("PATCH", `/api/pmo-comments/${id}`, { name, comment });
      return res.json() as Promise<PmoCommentWithUsers>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      qc.invalidateQueries({ queryKey: ["/api/organizations"] });
    },
  });
}
