import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";

type AgentRow = { id: number; name: string; kind?: "builtin" | "custom" };

export function useActiveAgentName(activeAgentId: number | null): string {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const { data: agents = [] } = useQuery<AgentRow[]>({
    queryKey: ["/api/agents", orgId, "picker"],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(`/api/agents?organizationId=${orgId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  if (activeAgentId == null) return "Friday Agent";
  const found = agents.find((a) => a.id === activeAgentId);
  return found?.name ?? "Agent";
}
