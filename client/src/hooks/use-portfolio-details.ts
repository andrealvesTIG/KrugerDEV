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

export function usePortfolioOverview(portfolioId: number) {
  return useQuery<PortfolioOverview>({
    queryKey: ['/api/portfolios', portfolioId, 'overview'],
    queryFn: () => fetch(`/api/portfolios/${portfolioId}/overview`).then(r => r.json()),
    enabled: portfolioId > 0,
  });
}

export function usePortfolioProjects(portfolioId: number) {
  return useQuery<Project[]>({
    queryKey: ['/api/portfolios', portfolioId, 'projects'],
    queryFn: () => fetch(`/api/portfolios/${portfolioId}/projects`).then(r => r.json()),
    enabled: portfolioId > 0,
  });
}

export function usePortfolioRisks(portfolioId: number) {
  return useQuery<PortfolioRisk[]>({
    queryKey: ['/api/portfolios', portfolioId, 'risks'],
    queryFn: () => fetch(`/api/portfolios/${portfolioId}/risks`).then(r => r.json()),
    enabled: portfolioId > 0,
  });
}

export function usePortfolioIssues(portfolioId: number) {
  return useQuery<PortfolioIssue[]>({
    queryKey: ['/api/portfolios', portfolioId, 'issues'],
    queryFn: () => fetch(`/api/portfolios/${portfolioId}/issues`).then(r => r.json()),
    enabled: portfolioId > 0,
  });
}

export function usePortfolioMilestones(portfolioId: number) {
  return useQuery<PortfolioMilestone[]>({
    queryKey: ['/api/portfolios', portfolioId, 'milestones'],
    queryFn: () => fetch(`/api/portfolios/${portfolioId}/milestones`).then(r => r.json()),
    enabled: portfolioId > 0,
  });
}
