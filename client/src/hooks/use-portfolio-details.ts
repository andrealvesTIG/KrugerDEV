import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Portfolio, Project, Risk, Issue, Milestone, PortfolioKeyDate } from "@shared/schema";

export interface PortfolioOverview {
  portfolio: Portfolio;
  metrics: {
    projectCount: number;
    totalBudget: number;
    avgCompletion: number;
    healthCounts: { green: number; yellow: number; red: number };
    riskCount: number;
    openRisks: number;
    highRisks: number;
    issueCount: number;
    openIssues: number;
    keyDateCount: number;
    upcomingKeyDates: number;
  };
  financialBudgets?: Record<number, number>;
}

export interface PortfolioRisk extends Risk {
  projectName: string;
}

export interface PortfolioIssue extends Issue {
  projectName: string;
}

export interface PortfolioMilestone extends Milestone {
  projectName: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
}

export function usePortfolioOverview(portfolioId: number) {
  return useQuery<PortfolioOverview>({
    queryKey: ['/api/portfolios', portfolioId, 'overview'],
    queryFn: () => fetchJson(`/api/portfolios/${portfolioId}/overview`),
    enabled: portfolioId > 0,
  });
}

export function usePortfolioProjects(portfolioId: number) {
  return useQuery<Project[]>({
    queryKey: ['/api/portfolios', portfolioId, 'projects'],
    queryFn: () => fetchJson(`/api/portfolios/${portfolioId}/projects`),
    enabled: portfolioId > 0,
  });
}

export function usePortfolioRisks(portfolioId: number) {
  return useQuery<PortfolioRisk[]>({
    queryKey: ['/api/portfolios', portfolioId, 'risks'],
    queryFn: () => fetchJson(`/api/portfolios/${portfolioId}/risks`),
    enabled: portfolioId > 0,
  });
}

export function usePortfolioIssues(portfolioId: number) {
  return useQuery<PortfolioIssue[]>({
    queryKey: ['/api/portfolios', portfolioId, 'issues'],
    queryFn: () => fetchJson(`/api/portfolios/${portfolioId}/issues`),
    enabled: portfolioId > 0,
  });
}

export function usePortfolioMilestones(portfolioId: number) {
  return useQuery<PortfolioMilestone[]>({
    queryKey: ['/api/portfolios', portfolioId, 'milestones'],
    queryFn: () => fetchJson(`/api/portfolios/${portfolioId}/milestones`),
    enabled: portfolioId > 0,
  });
}

export function usePortfolioKeyDates(portfolioId: number) {
  return useQuery<PortfolioKeyDate[]>({
    queryKey: ['/api/portfolios', portfolioId, 'key-dates'],
    queryFn: () => fetchJson(`/api/portfolios/${portfolioId}/key-dates`),
    enabled: portfolioId > 0,
  });
}

export function useCreatePortfolioKeyDate(portfolioId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<PortfolioKeyDate>) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/key-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create key date');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'key-dates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'overview'] });
    },
  });
}

export function useUpdatePortfolioKeyDate(portfolioId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<PortfolioKeyDate> & { id: number }) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/key-dates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update key date');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'key-dates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'overview'] });
    },
  });
}

export function useDeletePortfolioKeyDate(portfolioId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyDateId: number) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/key-dates/${keyDateId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete key date');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'key-dates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', portfolioId, 'overview'] });
    },
  });
}

export interface EscalatedItems {
  risks: (PortfolioRisk & { escalatedAt?: string | null; escalatedBy?: number | null })[];
  issues: (PortfolioIssue & { escalatedAt?: string | null; escalatedBy?: number | null })[];
}

export function usePortfolioEscalatedItems(portfolioId: number) {
  return useQuery<EscalatedItems>({
    queryKey: ['/api/portfolios', portfolioId, 'escalated-items'],
    queryFn: () => fetchJson(`/api/portfolios/${portfolioId}/escalated-items`),
    enabled: portfolioId > 0,
  });
}

export interface PortfolioScoringProjectBreakdown {
  projectId: number;
  projectName: string;
  score: number | null;
  justification: string | null;
}

export interface PortfolioScoringCriteriaRollup {
  criteriaId: number;
  criteriaName: string;
  criteriaCategory: string | null;
  criteriaWeight: string | null;
  maxScore: number | null;
  aggregationMethod: string;
  aggregatedScore: number | null;
  scoredProjectCount: number;
  totalProjectCount: number;
  projectBreakdown: PortfolioScoringProjectBreakdown[];
}

export interface KeyDateCompliance {
  total: number;
  completed: number;
  overdue: number;
  atRisk: number;
  upcoming: number;
  complianceRate: number | null;
}

export interface PortfolioScoringRollup {
  portfolioId: number;
  portfolioName: string;
  projectCount: number;
  overallScore: number | null;
  keyDateCompliance: KeyDateCompliance;
  criteria: PortfolioScoringCriteriaRollup[];
}

export function usePortfolioScoringRollup(portfolioId: number) {
  return useQuery<PortfolioScoringRollup>({
    queryKey: ['/api/portfolios', portfolioId, 'scoring-rollup'],
    queryFn: () => fetchJson(`/api/portfolios/${portfolioId}/scoring-rollup`),
    enabled: portfolioId > 0,
    staleTime: 30_000,
  });
}

export function useUpdatePortfolioScoringConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ portfolioId, criteriaId, aggregationMethod }: { portfolioId: number; criteriaId: number; aggregationMethod: string }) => {
      const res = await apiRequest('PUT', `/api/portfolios/${portfolioId}/scoring-config`, { criteriaId, aggregationMethod });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios', variables.portfolioId, 'scoring-rollup'] });
    },
  });
}
