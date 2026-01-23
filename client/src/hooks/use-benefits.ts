import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProjectBenefit, InsertProjectBenefit, ProjectDecision, InsertProjectDecision } from "@shared/schema";

// Project Benefits Hooks
export function useProjectBenefits(projectId: number | undefined) {
  return useQuery<ProjectBenefit[]>({
    queryKey: ['/api/projects', projectId, 'benefits'],
    queryFn: () => fetch(`/api/projects/${projectId}/benefits`).then(r => r.json()),
    enabled: !!projectId,
  });
}

export function useCreateProjectBenefit() {
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Partial<InsertProjectBenefit> }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/benefits`, data);
      return res.json();
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'benefits'] });
    },
  });
}

export function useUpdateProjectBenefit() {
  return useMutation({
    mutationFn: async ({ projectId, benefitId, data }: { projectId: number; benefitId: number; data: Partial<InsertProjectBenefit> }) => {
      const res = await apiRequest("PUT", `/api/projects/${projectId}/benefits/${benefitId}`, data);
      return res.json();
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'benefits'] });
    },
  });
}

export function useDeleteProjectBenefit() {
  return useMutation({
    mutationFn: async ({ projectId, benefitId }: { projectId: number; benefitId: number }) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/benefits/${benefitId}`);
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'benefits'] });
    },
  });
}

// Project Decisions Hooks
export function useProjectDecisions(projectId: number | undefined) {
  return useQuery<ProjectDecision[]>({
    queryKey: ['/api/projects', projectId, 'decisions'],
    queryFn: () => fetch(`/api/projects/${projectId}/decisions`).then(r => r.json()),
    enabled: !!projectId,
  });
}

export function useCreateProjectDecision() {
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Partial<InsertProjectDecision> }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/decisions`, data);
      return res.json();
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'decisions'] });
    },
  });
}

export function useUpdateProjectDecision() {
  return useMutation({
    mutationFn: async ({ projectId, decisionId, data }: { projectId: number; decisionId: number; data: Partial<InsertProjectDecision> }) => {
      const res = await apiRequest("PUT", `/api/projects/${projectId}/decisions/${decisionId}`, data);
      return res.json();
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'decisions'] });
    },
  });
}

export function useDeleteProjectDecision() {
  return useMutation({
    mutationFn: async ({ projectId, decisionId }: { projectId: number; decisionId: number }) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/decisions/${decisionId}`);
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'decisions'] });
    },
  });
}
