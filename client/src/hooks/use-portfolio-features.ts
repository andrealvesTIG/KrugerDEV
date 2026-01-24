import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { 
  PortfolioScoringCriteria, InsertPortfolioScoringCriteria,
  PortfolioScore, InsertPortfolioScore,
  PortfolioBenefit, InsertPortfolioBenefit,
  PortfolioDecision, InsertPortfolioDecision
} from "@shared/schema";

export function useScoringCriteria(organizationId: number | undefined) {
  return useQuery<PortfolioScoringCriteria[]>({
    queryKey: ['/api/organizations', organizationId, 'scoring-criteria'],
    enabled: !!organizationId,
  });
}

export function useCreateScoringCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, data }: { organizationId: number; data: Partial<InsertPortfolioScoringCriteria> }) => {
      const result = await apiRequest(`/api/organizations/${organizationId}/scoring-criteria`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'scoring-criteria'] });
    },
  });
}

export function useUpdateScoringCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, organizationId, data }: { id: number; organizationId: number; data: Partial<InsertPortfolioScoringCriteria> }) => {
      const result = await apiRequest(`/api/scoring-criteria/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
      return result;
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
      await apiRequest(`/api/scoring-criteria/${id}`, { method: 'DELETE' });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'scoring-criteria'] });
    },
  });
}

export function usePortfolioScores(portfolioId: number | undefined) {
  return useQuery<PortfolioScore[]>({
    queryKey: ['/api/portfolios', portfolioId, 'scores'],
    enabled: !!portfolioId,
  });
}

export function useSavePortfolioScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ portfolioId, criteriaId, score, justification }: { 
      portfolioId: number; criteriaId: number; score: number; justification?: string 
    }) => {
      const result = await apiRequest(`/api/portfolios/${portfolioId}/scores`, {
        method: 'POST',
        body: JSON.stringify({ criteriaId, score, justification }),
        headers: { 'Content-Type': 'application/json' }
      });
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'scores'] });
    },
  });
}

export function usePortfolioBenefits(portfolioId: number | undefined) {
  return useQuery<PortfolioBenefit[]>({
    queryKey: ['/api/portfolios', portfolioId, 'benefits'],
    enabled: !!portfolioId,
  });
}

export function useCreatePortfolioBenefit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ portfolioId, data }: { portfolioId: number; data: Partial<InsertPortfolioBenefit> }) => {
      const result = await apiRequest(`/api/portfolios/${portfolioId}/benefits`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'benefits'] });
    },
  });
}

export function useUpdatePortfolioBenefit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, portfolioId, data }: { id: number; portfolioId: number; data: Partial<InsertPortfolioBenefit> }) => {
      const result = await apiRequest(`/api/portfolio-benefits/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'benefits'] });
    },
  });
}

export function useDeletePortfolioBenefit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, portfolioId }: { id: number; portfolioId: number }) => {
      await apiRequest(`/api/portfolio-benefits/${id}`, { method: 'DELETE' });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'benefits'] });
    },
  });
}

export function usePortfolioDecisions(portfolioId: number | undefined) {
  return useQuery<PortfolioDecision[]>({
    queryKey: ['/api/portfolios', portfolioId, 'decisions'],
    enabled: !!portfolioId,
  });
}

export function useCreatePortfolioDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ portfolioId, data }: { portfolioId: number; data: Partial<InsertPortfolioDecision> }) => {
      const result = await apiRequest(`/api/portfolios/${portfolioId}/decisions`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'decisions'] });
    },
  });
}

export function useUpdatePortfolioDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, portfolioId, data }: { id: number; portfolioId: number; data: Partial<InsertPortfolioDecision> }) => {
      const result = await apiRequest(`/api/portfolio-decisions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'decisions'] });
    },
  });
}

export function useDeletePortfolioDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, portfolioId }: { id: number; portfolioId: number }) => {
      await apiRequest(`/api/portfolio-decisions/${id}`, { method: 'DELETE' });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'decisions'] });
    },
  });
}
