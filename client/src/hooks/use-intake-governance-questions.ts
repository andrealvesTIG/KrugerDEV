import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type {
  IntakeGovernanceQuestion,
  InsertIntakeGovernanceQuestion,
  UpdateIntakeGovernanceQuestionRequest,
  IntakeGovernanceCategory,
} from "@shared/schema";

export function useIntakeGovernanceQuestions(intakeId: number, category: IntakeGovernanceCategory) {
  return useQuery<IntakeGovernanceQuestion[]>({
    queryKey: ['/api/project-intakes', intakeId, 'governance-questions', { category }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/project-intakes/${intakeId}/governance-questions?category=${category}`,
      );
      return res.json();
    },
    enabled: !!intakeId,
  });
}

export function useCreateIntakeGovernanceQuestion(intakeId: number) {
  return useMutation({
    mutationFn: async (row: Omit<InsertIntakeGovernanceQuestion, 'intakeId'>) => {
      const res = await apiRequest("POST", `/api/project-intakes/${intakeId}/governance-questions`, row);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes', intakeId, 'governance-questions'] });
    },
  });
}

export function useUpdateIntakeGovernanceQuestion(intakeId: number) {
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateIntakeGovernanceQuestionRequest) => {
      const res = await apiRequest("PUT", `/api/intake-governance-questions/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes', intakeId, 'governance-questions'] });
    },
  });
}

export function useDeleteIntakeGovernanceQuestion(intakeId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/intake-governance-questions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes', intakeId, 'governance-questions'] });
    },
  });
}
