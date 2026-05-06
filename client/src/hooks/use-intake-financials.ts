import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { IntakeFinancial, InsertIntakeFinancial, UpdateIntakeFinancialRequest } from "@shared/schema";

export function useIntakeFinancials(intakeId: number) {
  return useQuery<IntakeFinancial[]>({
    queryKey: ['/api/project-intakes', intakeId, 'financials'],
    enabled: !!intakeId,
  });
}

export function useCreateIntakeFinancial(intakeId: number) {
  return useMutation({
    mutationFn: async (financial: Omit<InsertIntakeFinancial, 'intakeId'>) => {
      const res = await apiRequest("POST", `/api/project-intakes/${intakeId}/financials`, financial);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes', intakeId, 'financials'] });
    },
  });
}

export function useUpdateIntakeFinancial(intakeId: number) {
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateIntakeFinancialRequest) => {
      const res = await apiRequest("PUT", `/api/intake-financials/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes', intakeId, 'financials'] });
    },
  });
}

export function useDeleteIntakeFinancial(intakeId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/intake-financials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes', intakeId, 'financials'] });
    },
  });
}
