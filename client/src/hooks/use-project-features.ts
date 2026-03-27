import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { 
  ProjectScoringCriteria, InsertProjectScoringCriteria,
  ProjectScore, InsertProjectScore,
  ProjectBenefit, InsertProjectBenefit,
  ProjectDecision, InsertProjectDecision
} from "@shared/schema";

export function useScoringCriteria(organizationId: number | undefined) {
  return useQuery<ProjectScoringCriteria[]>({
    queryKey: ['/api/organizations', organizationId, 'scoring-criteria'],
    enabled: !!organizationId,
  });
}

export function useCreateScoringCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, data }: { organizationId: number; data: Partial<InsertProjectScoringCriteria> }) => {
      const res = await apiRequest('POST', `/api/organizations/${organizationId}/scoring-criteria`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'scoring-criteria'] });
    },
  });
}

export function useUpdateScoringCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, organizationId, data }: { id: number; organizationId: number; data: Partial<InsertProjectScoringCriteria> }) => {
      const res = await apiRequest('PUT', `/api/scoring-criteria/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'scoring-criteria'] });
    },
  });
}

export function useDeleteScoringCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, organizationId }: { id: number; organizationId: number }) => {
      await apiRequest('DELETE', `/api/scoring-criteria/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'scoring-criteria'] });
    },
  });
}

export function useProjectScores(projectId: number | undefined) {
  return useQuery<ProjectScore[]>({
    queryKey: ['/api/projects', projectId, 'scores'],
    enabled: !!projectId,
  });
}

export function useSaveProjectScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, criteriaId, score, justification }: { 
      projectId: number; criteriaId: number; score: number; justification?: string 
    }) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/scores`, { criteriaId, score, justification });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'scores'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'], exact: false });
    },
  });
}

export function useProjectBenefits(projectId: number | undefined) {
  return useQuery<ProjectBenefit[]>({
    queryKey: ['/api/projects', projectId, 'benefits'],
    enabled: !!projectId,
  });
}

export function useCreateProjectBenefit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Partial<InsertProjectBenefit> }) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/benefits`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'benefits'] });
    },
  });
}

export function useUpdateProjectBenefit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, data }: { id: number; projectId: number; data: Partial<InsertProjectBenefit> }) => {
      const res = await apiRequest('PUT', `/api/project-benefits/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'benefits'] });
    },
  });
}

export function useDeleteProjectBenefit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: number; projectId: number }) => {
      await apiRequest('DELETE', `/api/project-benefits/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'benefits'] });
    },
  });
}

export function useProjectDecisions(projectId: number | undefined) {
  return useQuery<ProjectDecision[]>({
    queryKey: ['/api/projects', projectId, 'decisions'],
    enabled: !!projectId,
  });
}

export function useCreateProjectDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Partial<InsertProjectDecision> }) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/decisions`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'decisions'] });
    },
  });
}

export function useUpdateProjectDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, data }: { id: number; projectId: number; data: Partial<InsertProjectDecision> }) => {
      const res = await apiRequest('PUT', `/api/project-decisions/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'decisions'] });
    },
  });
}

export function useDeleteProjectDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: number; projectId: number }) => {
      await apiRequest('DELETE', `/api/project-decisions/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'decisions'] });
    },
  });
}
