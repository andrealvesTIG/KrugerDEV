import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import type { PermissionDef } from "@shared/permissionCatalog";

interface MePermissionsResponse {
  organizationId: number | null;
  permissions: string[];
  catalog: PermissionDef[];
}

/**
 * Fetch the current user's effective permissions in the active org. Returns
 * a stable `has(key)` checker. Platform `super_admin` users always
 * receive every permission (computed server-side).
 */
export function usePermissions() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const enabled = !!orgId;
  const query = useQuery<MePermissionsResponse>({
    queryKey: ["/api/me/permissions", orgId],
    queryFn: async () => {
      const url = orgId
        ? `/api/me/permissions?organizationId=${orgId}`
        : "/api/me/permissions";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load permissions");
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });

  const set = new Set(query.data?.permissions || []);
  return {
    isLoading: query.isLoading,
    permissions: query.data?.permissions || [],
    catalog: query.data?.catalog || [],
    has: (key: string) => set.has(key),
    hasAny: (keys: string[]) => keys.some(k => set.has(k)),
    hasAll: (keys: string[]) => keys.every(k => set.has(k)),
  };
}

/**
 * Lightweight wrapper component that renders its children only when the
 * current user has the given permission. Use either `permission` (single
 * key) or `anyOf` (any of several keys).
 */
import type { ReactNode } from "react";

interface CanProps {
  permission?: string;
  anyOf?: string[];
  fallback?: ReactNode;
  /**
   * Optional node to render while the permissions query is still in
   * flight. Defaults to `null` (renders nothing) so existing call sites
   * keep their previous behaviour. Pass a skeleton or spinner here when
   * the gated UI is large enough that a blank flash would be jarring.
   */
  loadingFallback?: ReactNode;
  children: ReactNode;
}

export function Can({ permission, anyOf, fallback = null, loadingFallback = null, children }: CanProps) {
  const { has, hasAny, isLoading } = usePermissions();
  if (isLoading) return <>{loadingFallback}</>;
  const ok = permission ? has(permission) : anyOf ? hasAny(anyOf) : true;
  return <>{ok ? children : fallback}</>;
}
