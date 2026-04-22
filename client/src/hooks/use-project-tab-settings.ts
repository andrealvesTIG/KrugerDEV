import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProjectTabSettings } from "@shared/projectTabs";

export function useProjectTabSettings(organizationId: number | undefined) {
  return useQuery<ProjectTabSettings>({
    queryKey: [`/api/organizations/${organizationId}/project-tab-settings`],
    enabled: !!organizationId,
  });
}

export function useUpdateProjectTabSettings() {
  return useMutation({
    mutationFn: async ({ organizationId, ...data }: ProjectTabSettings & { organizationId: number }) => {
      const res = await apiRequest(
        "PUT",
        `/api/organizations/${organizationId}/project-tab-settings`,
        data,
      );
      return (await res.json()) as ProjectTabSettings;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(
        [`/api/organizations/${variables.organizationId}/project-tab-settings`],
        data,
      );
    },
  });
}
