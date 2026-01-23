import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { PortfolioScoringCriteria, InsertPortfolioScoringCriteria, ProjectScore, InsertProjectScore } from "@shared/schema";

// Scoring Criteria Hooks
export function useScoringCriteria(organizationId: number | undefined) {
  return useQuery<PortfolioScoringCriteria[]>({
    queryKey: ['/api/organizations', organizationId, 'scoring-criteria'],
    queryFn: () => fetch(`/api/organizations/${organizationId}/scoring-criteria`).then(r => r.json()),
    enabled: !!organizationId,
  });
}

export function useCreateScoringCriteria() {
  return useMutation({
    mutationFn: async ({ organizationId, data }: { organizationId: number; data: Partial<InsertPortfolioScoringCriteria> }) => {
      const res = await apiRequest("POST", `/api/organizations/${organizationId}/scoring-criteria`, data);
      return res.json();
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'scoring-criteria'] });
    },
  });
}

export function useUpdateScoringCriteria() {
  return useMutation({
    mutationFn: async ({ organizationId, criteriaId, data }: { organizationId: number; criteriaId: number; data: Partial<InsertPortfolioScoringCriteria> }) => {
      const res = await apiRequest("PUT", `/api/organizations/${organizationId}/scoring-criteria/${criteriaId}`, data);
      return res.json();
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'scoring-criteria'] });
    },
  });
}

export function useDeleteScoringCriteria() {
  return useMutation({
    mutationFn: async ({ organizationId, criteriaId }: { organizationId: number; criteriaId: number }) => {
      await apiRequest("DELETE", `/api/organizations/${organizationId}/scoring-criteria/${criteriaId}`);
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'scoring-criteria'] });
    },
  });
}

// Project Scores Hooks
export function useProjectScores(projectId: number | undefined) {
  return useQuery<ProjectScore[]>({
    queryKey: ['/api/projects', projectId, 'scores'],
    queryFn: () => fetch(`/api/projects/${projectId}/scores`).then(r => r.json()),
    enabled: !!projectId,
  });
}

export function useUpsertProjectScore() {
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Partial<InsertProjectScore> }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/scores`, data);
      return res.json();
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'scores'] });
    },
  });
}
