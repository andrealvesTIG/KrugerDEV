import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ExecutiveSummary } from "@shared/schema";

export type ExecutiveSummaryWithUsers = ExecutiveSummary & {
  createdByName: string | null;
  updatedByName: string | null;
};

export function useProjectExecutiveSummaries(projectId: number | undefined) {
  return useQuery<ExecutiveSummaryWithUsers[]>({
    queryKey: ["/api/projects", projectId, "executive-summaries"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/executive-summaries`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project executive summaries");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useOrgExecutiveSummaries(organizationId: number | undefined) {
  return useQuery<ExecutiveSummaryWithUsers[]>({
    queryKey: ["/api/organizations", organizationId, "executive-summaries"],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/executive-summaries`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch organization executive summaries");
      return res.json();
    },
    enabled: !!organizationId,
  });
}

export function useCreateProjectExecutiveSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, name, summary }: { projectId: number; name: string; summary?: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/executive-summaries`, { name, summary });
      return res.json() as Promise<ExecutiveSummaryWithUsers>;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "executive-summaries"] });
      qc.invalidateQueries({ queryKey: ["/api/organizations"] });
    },
  });
}

export function useLinkExecutiveSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, summaryId }: { projectId: number; summaryId: number }) => {
      await apiRequest("POST", `/api/projects/${projectId}/executive-summaries/${summaryId}/link`);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "executive-summaries"] });
    },
  });
}

export function useUnlinkExecutiveSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, summaryId }: { projectId: number; summaryId: number }) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/executive-summaries/${summaryId}`);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "executive-summaries"] });
    },
  });
}

export function useUpdateExecutiveSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, summary }: { id: number; name?: string; summary?: string }) => {
      const res = await apiRequest("PATCH", `/api/executive-summaries/${id}`, { name, summary });
      return res.json() as Promise<ExecutiveSummaryWithUsers>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      qc.invalidateQueries({ queryKey: ["/api/organizations"] });
    },
  });
}
