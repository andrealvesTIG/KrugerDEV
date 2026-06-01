import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ProjectPcnRa } from "@shared/schema";

export type ProjectPcnRaWithUsers = ProjectPcnRa & {
  createdByName: string | null;
  updatedByName: string | null;
};

export type PcnRaInput = {
  year?: string | number | null;
  pcnAmount?: string | number | null;
  pcnId?: string | null;
  raAmount?: string | number | null;
  raId?: string | null;
};

export function useProjectPcnsRas(projectId: number | undefined) {
  return useQuery<ProjectPcnRaWithUsers[]>({
    queryKey: ["/api/projects", projectId, "pcns-ras"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pcns-ras`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch PCNs/RAs");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectPcnRa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, input }: { projectId: number; input: PcnRaInput }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/pcns-ras`, input);
      return res.json() as Promise<ProjectPcnRaWithUsers>;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "pcns-ras"] });
    },
  });
}

export function useUpdateProjectPcnRa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: PcnRaInput }) => {
      const res = await apiRequest("PATCH", `/api/pcns-ras/${id}`, input);
      return res.json() as Promise<ProjectPcnRaWithUsers>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });
}

export function useDeleteProjectPcnRa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; projectId: number }) => {
      await apiRequest("DELETE", `/api/pcns-ras/${id}`);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "pcns-ras"] });
    },
  });
}
