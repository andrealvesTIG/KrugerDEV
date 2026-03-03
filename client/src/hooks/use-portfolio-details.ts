import { useQuery } from "@tanstack/react-query";
import type { Portfolio, Project, Risk, Issue, Milestone } from "@shared/schema";

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
    milestoneCount: number;
    upcomingMilestones: number;
  };
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
