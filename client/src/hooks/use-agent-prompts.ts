import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";

type AgentDetail = { id: number; suggestedPrompts?: string[] | null; name?: string };

export function useAgentSuggestedPrompts(activeAgentId: number | null): string[] | null {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const { data } = useQuery<AgentDetail | null>({
    queryKey: ["/api/agents/detail", activeAgentId, orgId],
    queryFn: async () => {
      if (!orgId || activeAgentId == null) return null;
      const res = await fetch(`/api/agents/${activeAgentId}?organizationId=${orgId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!orgId && activeAgentId != null,
    staleTime: 60_000,
    // Suggested prompts are generated server-side asynchronously after an
    // agent is created or its systemPrompt changes (fire-and-forget LLM
    // call). Poll every 4s until they appear so the empty-state cards
    // populate without requiring a manual refresh; stop polling once we
    // have them.
    refetchInterval: (query) => {
      const cur = query.state.data;
      const have = Array.isArray(cur?.suggestedPrompts) && cur!.suggestedPrompts!.length > 0;
      return have ? false : 4_000;
    },
  });

  if (activeAgentId == null) return null;
  const prompts = data?.suggestedPrompts;
  if (!Array.isArray(prompts) || prompts.length === 0) return null;
  return prompts;
}
