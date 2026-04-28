import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  ProjectScoringCriteria,
  InsertProjectScoringCriteria,
} from "@shared/schema";

export type PortfolioScoringCriteria = ProjectScoringCriteria;
export type InsertPortfolioScoringCriteria = InsertProjectScoringCriteria;

export interface PortfolioScore {
  id: number;
  portfolioId: number;
  criteriaId: number;
  score: number;
  justification?: string | null;
}

export interface PortfolioBenefit {
  id: number;
  portfolioId: number;
  name: string;
  description?: string | null;
  targetValue?: string | null;
  actualValue?: string | null;
}

export interface PortfolioDecision {
  id: number;
  portfolioId: number;
  title: string;
  description?: string | null;
  decision?: string | null;
  decisionDate?: string | Date | null;
}

export type InsertPortfolioBenefit = Partial<PortfolioBenefit>;
export type InsertPortfolioDecision = Partial<PortfolioDecision>;

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
    mutationFn: async ({ id, data }: { id: number; organizationId: number; data: Partial<InsertPortfolioScoringCriteria> }) => {
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
    mutationFn: async ({ id }: { id: number; organizationId: number }) => {
      await apiRequest('DELETE', `/api/scoring-criteria/${id}`);
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
      const res = await apiRequest('POST', `/api/portfolios/${portfolioId}/scores`, { criteriaId, score, justification });
      return res.json();
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
      const res = await apiRequest('POST', `/api/portfolios/${portfolioId}/benefits`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'benefits'] });
    },
  });
}

export function useUpdatePortfolioBenefit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; portfolioId: number; data: Partial<InsertPortfolioBenefit> }) => {
      const res = await apiRequest('PUT', `/api/portfolio-benefits/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'benefits'] });
    },
  });
}

export function useDeletePortfolioBenefit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; portfolioId: number }) => {
      await apiRequest('DELETE', `/api/portfolio-benefits/${id}`);
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
      const res = await apiRequest('POST', `/api/portfolios/${portfolioId}/decisions`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'decisions'] });
    },
  });
}

export function useUpdatePortfolioDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; portfolioId: number; data: Partial<InsertPortfolioDecision> }) => {
      const res = await apiRequest('PUT', `/api/portfolio-decisions/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'decisions'] });
    },
  });
}

export function useDeletePortfolioDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; portfolioId: number }) => {
      await apiRequest('DELETE', `/api/portfolio-decisions/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'decisions'] });
    },
  });
}
