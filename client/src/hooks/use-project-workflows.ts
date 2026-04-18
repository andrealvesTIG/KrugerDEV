import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { apiRequest } from "@/lib/queryClient";

export interface ProjectWorkflow {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  isDefault: boolean | null;
  isActive: boolean | null;
  creationMode: string;
  creationUrl: string | null;
}

/**
 * Fetches the list of project workflow templates for the current organization.
 *
 * The backend endpoint is optional — when it's not yet wired up the hook
 * returns an empty list so consumers can render gracefully (e.g. by falling
 * back to the default lifecycle).
 */
export function useProjectWorkflows() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const query = useQuery<ProjectWorkflow[]>({
    queryKey: ["/api/project-workflows", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/project-workflows");
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    workflows: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
