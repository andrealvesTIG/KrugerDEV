import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ProjectSoftwareLicense } from "@shared/schema";

export type ProjectSoftwareLicenseWithUsers = ProjectSoftwareLicense & {
  createdByName: string | null;
  updatedByName: string | null;
};

export type SoftwareLicenseInput = {
  vendor?: string | null;
  softwareName?: string | null;
  opexTrailStartDate?: string | null;
  totalCost?: string | number | null;
  frequencyOfRenewal?: string | null;
  softwareType?: string | null;
};

export function useProjectSoftwareLicenses(projectId: number | undefined) {
  return useQuery<ProjectSoftwareLicenseWithUsers[]>({
    queryKey: ["/api/projects", projectId, "software-licenses"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/software-licenses`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch software/licenses");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectSoftwareLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, input }: { projectId: number; input: SoftwareLicenseInput }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/software-licenses`, input);
      return res.json() as Promise<ProjectSoftwareLicenseWithUsers>;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "software-licenses"] });
    },
  });
}

export function useUpdateProjectSoftwareLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: SoftwareLicenseInput }) => {
      const res = await apiRequest("PATCH", `/api/software-licenses/${id}`, input);
      return res.json() as Promise<ProjectSoftwareLicenseWithUsers>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });
}

export function useDeleteProjectSoftwareLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; projectId: number }) => {
      await apiRequest("DELETE", `/api/software-licenses/${id}`);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/projects", vars.projectId, "software-licenses"] });
    },
  });
}
