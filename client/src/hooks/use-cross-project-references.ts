import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CrossProjectReference } from "@shared/schema";

type EnrichedCrossProjectReference = CrossProjectReference & {
  sourceName?: string;
  targetName?: string;
  sourceProjectName?: string;
  targetProjectName?: string;
};

export function useCrossProjectReferences(entityType: "task" | "project", entityId: number | undefined) {
  return useQuery<EnrichedCrossProjectReference[]>({
    queryKey: ["cross-project-references", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/cross-project-references?entityType=${entityType}&entityId=${entityId}`);
      if (!res.ok) throw new Error("Failed to fetch cross-project references");
      return res.json();
    },
    enabled: !!entityId && entityId > 0,
  });
}

export function useCrossProjectReferencesByProject(projectId: number | undefined) {
  return useQuery<EnrichedCrossProjectReference[]>({
    queryKey: ["cross-project-references", "by-project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/cross-project-references/by-project/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project references");
      return res.json();
    },
    enabled: !!projectId && projectId > 0,
  });
}

export function useTasksForReference(projectId: number | undefined) {
  return useQuery<{ id: number; name: string; status: string; projectId: number }[]>({
    queryKey: ["tasks-for-reference", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/tasks-for-reference`);
      if (!res.ok) throw new Error("Failed to fetch tasks for reference");
      return res.json();
    },
    enabled: !!projectId && projectId > 0,
  });
}

export function useCreateCrossProjectReference() {
  return useMutation({
    mutationFn: async (data: {
      organizationId: number;
      referenceType: string;
      sourceType: string;
      sourceId: number;
      sourceProjectId: number;
      targetType: string;
      targetId: number;
      targetProjectId: number;
      relationshipType: string;
      notes?: string | null;
    }) => {
      const res = await apiRequest("POST", "/api/cross-project-references", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cross-project-references"] });
    },
  });
}

export function useDeleteCrossProjectReference() {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cross-project-references/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cross-project-references"] });
    },
  });
}
