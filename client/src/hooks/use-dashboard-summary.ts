import { useQuery } from "@tanstack/react-query";

export interface DashboardSummary {
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
  };
  tasksByAssignee: {
    assignee: string | null;
    status: string | null;
    count: number;
  }[];
  risks: {
    total: number;
    open: number;
    mitigated: number;
    closed: number;
    highPriority: number;
    criticalImpact: number;
  };
  risksByPriority: { priority: string | null; count: number }[];
  issues: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    highPriority: number;
  };
  issuesByPriority: { priority: string | null; count: number }[];
  projects: {
    total: number;
    byHealth: Record<string, number>;
    byStatus: Record<string, number>;
    totalBudget: number;
    totalActualCost: number;
    avgCompletion: number;
  };
}

export function useDashboardSummary(organizationId?: number | null) {
  return useQuery<DashboardSummary>({
    queryKey: ['/api/dashboard/summary', organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/summary?organizationId=${organizationId}`);
      if (!res.ok) throw new Error('Failed to fetch dashboard summary');
      return res.json();
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });
}
