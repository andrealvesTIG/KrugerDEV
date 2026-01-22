import { useQuery } from "@tanstack/react-query";
import type { HealthStatusHistory } from "@shared/schema";

export function useHealthStatusHistory(projectId: number) {
  return useQuery<HealthStatusHistory[]>({
    queryKey: ['/api/projects', projectId, 'health-status-history'],
    enabled: !!projectId,
  });
}
