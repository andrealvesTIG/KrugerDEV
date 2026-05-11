import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProjectFormLayoutTabDTO } from "@shared/schema";

export interface ProjectFormLayoutItemFull { id: number; itemType: "field" | "custom_field" | "block"; itemKey: string; width: "full" | "half" | "third"; position: number; displayName: string | null; }
export interface ProjectFormLayoutSectionFull { id: number; title: string | null; description: string | null; width: "full" | "half" | "third"; position: number; items: ProjectFormLayoutItemFull[]; }
export interface ProjectFormLayoutTabFull { id: number; key: string; label: string; icon: string | null; isActive: boolean; position: number; sections: ProjectFormLayoutSectionFull[]; }

export function useProjectFormLayout(organizationId: number | undefined) {
  return useQuery<ProjectFormLayoutTabFull[]>({
    queryKey: ['/api/organizations', organizationId, 'project-form-layout'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${organizationId}/project-form-layout`);
      return res.json();
    },
    enabled: !!organizationId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useSaveProjectFormLayout(organizationId: number | undefined) {
  return useMutation({
    mutationFn: async (tabs: ProjectFormLayoutTabDTO[]) => {
      if (!organizationId) throw new Error("No organization selected");
      const res = await apiRequest("PUT", `/api/organizations/${organizationId}/project-form-layout`, { tabs });
      return res.json() as Promise<ProjectFormLayoutTabFull[]>;
    },
    onSuccess: (data) => {
      const key = ['/api/organizations', organizationId, 'project-form-layout'];
      queryClient.setQueryData(key, data);
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useResetProjectFormLayout(organizationId: number | undefined) {
  return useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No organization selected");
      const res = await apiRequest("POST", `/api/organizations/${organizationId}/project-form-layout/reset`);
      return res.json() as Promise<ProjectFormLayoutTabFull[]>;
    },
    onSuccess: (data) => {
      const key = ['/api/organizations', organizationId, 'project-form-layout'];
      queryClient.setQueryData(key, data);
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
