import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type {
  IntakeCostingChecklistRow,
  InsertIntakeCostingChecklistRow,
  UpdateIntakeCostingChecklistRowRequest,
} from "@shared/schema";

export function useIntakeCostingChecklist(intakeId: number) {
  return useQuery<IntakeCostingChecklistRow[]>({
    queryKey: ['/api/project-intakes', intakeId, 'costing-checklist'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/project-intakes/${intakeId}/costing-checklist`);
      return res.json();
    },
    enabled: !!intakeId,
  });
}

export function useCreateIntakeCostingChecklistRow(intakeId: number) {
  return useMutation({
    mutationFn: async (row: Omit<InsertIntakeCostingChecklistRow, 'intakeId'>) => {
      const res = await apiRequest("POST", `/api/project-intakes/${intakeId}/costing-checklist`, row);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes', intakeId, 'costing-checklist'] });
    },
  });
}

export function useUpdateIntakeCostingChecklistRow(intakeId: number) {
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateIntakeCostingChecklistRowRequest) => {
      const res = await apiRequest("PUT", `/api/intake-costing-checklist/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes', intakeId, 'costing-checklist'] });
    },
  });
}

export function useDeleteIntakeCostingChecklistRow(intakeId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/intake-costing-checklist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes', intakeId, 'costing-checklist'] });
    },
  });
}
