import { useQuery } from "@tanstack/react-query";
import type { ResolvedCalendar } from "@shared/lib/calendarEngine";

/** Effective project calendar (project.calendarId → org default → null). */
export function useProjectResolvedCalendar(projectId: number | null | undefined) {
  return useQuery<ResolvedCalendar | null>({
    queryKey: ["/api/projects", projectId, "resolved-calendar"],
    queryFn: async () => {
      if (projectId == null) return null;
      const res = await fetch(`/api/projects/${projectId}/resolved-calendar`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load project calendar: ${res.status}`);
      return res.json();
    },
    enabled: projectId != null,
    staleTime: 60_000,
  });
}

/**
 * Effective resource calendar. When `projectId` is provided, the project
 * calendar is layered with the resource's non-working windows (the project
 * calendar otherwise drives scheduling).
 */
export function useResourceResolvedCalendar(resourceId: number | null | undefined, projectId?: number | null) {
  return useQuery<ResolvedCalendar | null>({
    queryKey: ["/api/resources", resourceId, "resolved-calendar", projectId ?? null],
    queryFn: async () => {
      if (resourceId == null) return null;
      const qs = projectId != null ? `?projectId=${projectId}` : "";
      const res = await fetch(`/api/resources/${resourceId}/resolved-calendar${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load resource calendar: ${res.status}`);
      return res.json();
    },
    enabled: resourceId != null,
    staleTime: 60_000,
  });
}
