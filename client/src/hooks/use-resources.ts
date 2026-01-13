import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Resource, InsertResource, TaskResourceAssignment, IssueResourceAssignment, RiskResourceAssignment } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

type ResourceWithAssignment = TaskResourceAssignment & { resource: Resource };
type IssueResourceWithAssignment = IssueResourceAssignment & { resource: Resource };
type RiskResourceWithAssignment = RiskResourceAssignment & { resource: Resource };

export function useResources(organizationId: number | null) {
  return useQuery<Resource[]>({
    queryKey: ["/api/resources", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await fetch(`/api/resources?organizationId=${organizationId}`);
      if (!response.ok) throw new Error("Failed to fetch resources");
      return response.json();
    },
  });
}

export function useResource(id: number | null) {
  return useQuery<Resource>({
    queryKey: ["/api/resources", id],
    enabled: !!id,
    queryFn: async () => {
      const response = await fetch(`/api/resources/${id}`);
      if (!response.ok) throw new Error("Failed to fetch resource");
      return response.json();
    },
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (resource: InsertResource) => {
      const response = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resource),
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.message || "Failed to create resource") as any;
        error.limitExceeded = errorData.limitExceeded;
        error.resourceType = errorData.resourceType;
        throw error;
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources", variables.organizationId] });
    },
  });
}

export function useUpdateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<InsertResource> }) => {
      const response = await apiRequest("PUT", `/api/resources/${id}`, updates);
      return response.json();
    },
    onSuccess: (data: Resource) => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources", data.organizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources", data.id] });
    },
  });
}

export function useDeleteResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, organizationId }: { id: number; organizationId: number }) => {
      await apiRequest("DELETE", `/api/resources/${id}`);
      return { organizationId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources", data.organizationId] });
    },
  });
}

export function useTaskResourceAssignments(taskId: number | null) {
  return useQuery<ResourceWithAssignment[]>({
    queryKey: ["/api/tasks", taskId, "resources"],
    enabled: !!taskId,
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}/resources`);
      if (!response.ok) throw new Error("Failed to fetch task assignments");
      return response.json();
    },
  });
}

export function useUpdateTaskResourceAssignments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, resourceIds }: { taskId: number; resourceIds: number[] }) => {
      const response = await apiRequest("PUT", `/api/tasks/${taskId}/resources`, { resourceIds });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", variables.taskId, "resources"] });
    },
  });
}

export function useIssueResourceAssignments(issueId: number | null) {
  return useQuery<IssueResourceWithAssignment[]>({
    queryKey: ["/api/issues", issueId, "resources"],
    enabled: !!issueId,
    queryFn: async () => {
      const response = await fetch(`/api/issues/${issueId}/resources`);
      if (!response.ok) throw new Error("Failed to fetch issue assignments");
      return response.json();
    },
  });
}

export function useUpdateIssueResourceAssignments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueId, resourceIds }: { issueId: number; resourceIds: number[] }) => {
      const response = await apiRequest("PUT", `/api/issues/${issueId}/resources`, { resourceIds });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues", variables.issueId, "resources"] });
    },
  });
}

export function useRiskResourceAssignments(riskId: number | null) {
  return useQuery<RiskResourceWithAssignment[]>({
    queryKey: ["/api/risks", riskId, "resources"],
    enabled: !!riskId,
    queryFn: async () => {
      const response = await fetch(`/api/risks/${riskId}/resources`);
      if (!response.ok) throw new Error("Failed to fetch risk assignments");
      return response.json();
    },
  });
}

export function useUpdateRiskResourceAssignments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ riskId, resourceIds }: { riskId: number; resourceIds: number[] }) => {
      const response = await apiRequest("PUT", `/api/risks/${riskId}/resources`, { resourceIds });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/risks", variables.riskId, "resources"] });
    },
  });
}
