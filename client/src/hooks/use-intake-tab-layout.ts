import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { IntakeTabLayoutTabDTO } from "@shared/schema";

export interface IntakeTabLayoutItemFull { id: number; itemType: "field" | "custom_field" | "block"; itemKey: string; width: "full" | "half" | "third"; position: number; displayName: string | null; }
export interface IntakeTabLayoutSectionFull { id: number; title: string | null; description: string | null; position: number; items: IntakeTabLayoutItemFull[]; }
export interface IntakeTabLayoutTabFull { id: number; key: string; label: string; icon: string | null; isActive: boolean; position: number; sections: IntakeTabLayoutSectionFull[]; }

export function useIntakeTabLayout(organizationId: number | undefined) {
  return useQuery<IntakeTabLayoutTabFull[]>({
    queryKey: ['/api/organizations', organizationId, 'intake-tab-layout'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${organizationId}/intake-tab-layout`);
      return res.json();
    },
    enabled: !!organizationId,
    // Layout edits in Settings should be visible on intake pages immediately,
    // so override the global staleTime: Infinity for this query.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useSaveIntakeTabLayout(organizationId: number | undefined) {
  return useMutation({
    mutationFn: async (tabs: IntakeTabLayoutTabDTO[]) => {
      if (!organizationId) throw new Error("No organization selected");
      const res = await apiRequest("PUT", `/api/organizations/${organizationId}/intake-tab-layout`, { tabs });
      return res.json() as Promise<IntakeTabLayoutTabFull[]>;
    },
    onSuccess: (data) => {
      const key = ['/api/organizations', organizationId, 'intake-tab-layout'];
      queryClient.setQueryData(key, data);
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useResetIntakeTabLayout(organizationId: number | undefined) {
  return useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No organization selected");
      const res = await apiRequest("POST", `/api/organizations/${organizationId}/intake-tab-layout/reset`);
      return res.json() as Promise<IntakeTabLayoutTabFull[]>;
    },
    onSuccess: (data) => {
      const key = ['/api/organizations', organizationId, 'intake-tab-layout'];
      queryClient.setQueryData(key, data);
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
