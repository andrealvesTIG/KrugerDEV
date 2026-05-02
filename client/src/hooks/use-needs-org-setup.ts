import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "./use-organization";

export interface OrgSetupStatus {
  needsSetup: boolean;
  projectCount: number;
  portfolioCount: number;
  industry: string | null;
  role: string | null;
  canConfigure: boolean;
  onboardingCompleted: boolean;
}

export function useOrgSetupStatus() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const query = useQuery<OrgSetupStatus>({
    queryKey: ["/api/onboarding/org-setup-status", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/onboarding/org-setup-status?organizationId=${orgId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load org setup status");
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const data = query.data;
  return {
    status: data,
    needsSetup: !!data?.needsSetup && !data?.onboardingCompleted,
    canConfigure: !!data?.canConfigure,
    isLoading: query.isLoading,
  };
}
