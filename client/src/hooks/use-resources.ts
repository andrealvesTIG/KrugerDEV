import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Resource, InsertResource, TaskResourceAssignment, IssueResourceAssignment, RiskResourceAssignment, ResourceSkill, InsertResourceSkill, ResourceAvailability, InsertResourceAvailability } from "@shared/schema";
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

export function useAllTaskResourceAssignments(organizationId: number | null) {
  return useQuery<{ taskId: number; resourceId: number; resourceName: string }[]>({
    queryKey: ["/api/organizations", organizationId, "task-assignments"],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationId}/task-assignments`);
      if (!response.ok) throw new Error("Failed to fetch all task assignments");
      return response.json();
    },
  });
}

export function useOrgFullTaskAssignments(organizationId: number | null) {
  return useQuery<(import("@shared/schema").TaskResourceAssignment & { resource: import("@shared/schema").Resource })[]>({
    queryKey: ["/api/organizations", organizationId, "full-task-assignments"],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationId}/full-task-assignments`);
      if (!response.ok) throw new Error("Failed to fetch org full task assignments");
      return response.json();
    },
  });
}

export function useProjectTaskAssignments(projectId: number | null) {
  return useQuery<(import("@shared/schema").TaskResourceAssignment & { resource: import("@shared/schema").Resource })[]>({
    queryKey: ["/api/projects", projectId, "task-resource-assignments"],
    enabled: !!projectId,
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/task-resource-assignments`);
      if (!response.ok) throw new Error("Failed to fetch project task assignments");
      return response.json();
    },
  });
}

export function useAllIssueResourceAssignments(organizationId: number | null) {
  return useQuery<(import("@shared/schema").IssueResourceAssignment & { resource: import("@shared/schema").Resource })[]>({
    queryKey: ["/api/organizations", organizationId, "issue-assignments"],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationId}/issue-assignments`);
      if (!response.ok) throw new Error("Failed to fetch all issue assignments");
      return response.json();
    },
  });
}

export function useUpdateTaskResourceAssignments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, resourceIds, allocations, expectedUpdatedAt }: { 
      taskId: number; 
      resourceIds: number[]; 
      allocations?: { resourceId: number; allocationPercentage: number }[];
      expectedUpdatedAt?: string;
    }) => {
      const response = await fetch(`/api/tasks/${taskId}/resources`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceIds, allocations, expectedUpdatedAt }),
        credentials: "include",
      });
      if (response.status === 409) {
        const data = await response.json().catch(() => ({}));
        const err = new Error(data.message || 'Task was modified by another user. Please refresh and try again.') as any;
        err.status = 409;
        throw err;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Failed to update task assignments");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", variables.taskId, "resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
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

// Resource Skills hooks
export function useResourceSkills(orgId: number | null, resourceId: number | null) {
  return useQuery<ResourceSkill[]>({
    queryKey: ["/api/organizations", orgId, "resources", resourceId, "skills"],
    enabled: !!orgId && !!resourceId,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${orgId}/resources/${resourceId}/skills`);
      if (!response.ok) throw new Error("Failed to fetch resource skills");
      return response.json();
    },
  });
}

export function useOrgResourceSkills(orgId: number | null) {
  return useQuery<ResourceSkill[]>({
    queryKey: ["/api/organizations", orgId, "resource-skills"],
    enabled: !!orgId,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${orgId}/resource-skills`);
      if (!response.ok) throw new Error("Failed to fetch org resource skills");
      return response.json();
    },
  });
}

export function useAddResourceSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, resourceId, data }: { orgId: number; resourceId: number; data: Partial<InsertResourceSkill> }) => {
      const response = await apiRequest("POST", `/api/organizations/${orgId}/resources/${resourceId}/skills`, data);
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", variables.orgId, "resources", variables.resourceId, "skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", variables.orgId, "resource-skills"] });
    },
  });
}

export function useRemoveResourceSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, id }: { orgId: number; id: number }) => {
      await apiRequest("DELETE", `/api/organizations/${orgId}/resource-skills/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", variables.orgId, "resource-skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", variables.orgId, "resources"] });
    },
  });
}

// Resource Availability hooks
export function useResourceAvailabilityEntries(orgId: number | null, resourceId: number | null) {
  return useQuery<ResourceAvailability[]>({
    queryKey: ["/api/organizations", orgId, "resources", resourceId, "availability"],
    enabled: !!orgId && !!resourceId,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${orgId}/resources/${resourceId}/availability`);
      if (!response.ok) throw new Error("Failed to fetch resource availability");
      return response.json();
    },
  });
}

export function useOrgResourceAvailability(orgId: number | null, startDate?: string, endDate?: string) {
  return useQuery<ResourceAvailability[]>({
    queryKey: ["/api/organizations", orgId, "resource-availability", startDate, endDate],
    enabled: !!orgId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const response = await fetch(`/api/organizations/${orgId}/resource-availability?${params}`);
      if (!response.ok) throw new Error("Failed to fetch org resource availability");
      return response.json();
    },
  });
}

export function useAddResourceAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, resourceId, data }: { orgId: number; resourceId: number; data: Partial<InsertResourceAvailability> }) => {
      const response = await apiRequest("POST", `/api/organizations/${orgId}/resources/${resourceId}/availability`, data);
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", variables.orgId, "resource-availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", variables.orgId, "resources", variables.resourceId, "availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", variables.orgId, "resource-utilization"] });
    },
  });
}

export function useRemoveResourceAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, id }: { orgId: number; id: number }) => {
      await apiRequest("DELETE", `/api/organizations/${orgId}/resource-availability/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", variables.orgId, "resource-availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", variables.orgId, "resource-utilization"] });
    },
  });
}

// Resource Utilization hook
export interface ResourceUtilizationData {
  resourceId: number;
  displayName: string;
  department: string | null;
  title: string | null;
  weeklyCapacity: number;
  availabilityPct: number;
  effectiveWeeklyHours: number;
  totalAllocationPct: number;
  allocatedHoursPerWeek: number;
  actualHours: number;
  utilizationPct: number;
  isOverAllocated: boolean;
  assignmentCount: number;
  timeOffDays: number;
  assignments: { taskId: number; allocationPercentage: number }[];
}

export interface UtilizationSummary {
  totalResources: number;
  overAllocated: number;
  underAllocated: number;
  optimallyAllocated: number;
  avgUtilization: number;
}

export interface UtilizationResponse {
  resources: ResourceUtilizationData[];
  summary: UtilizationSummary;
}

export function useResourceUtilization(orgId: number | null, startDate?: string, endDate?: string) {
  return useQuery<UtilizationResponse>({
    queryKey: ["/api/organizations", orgId, "resource-utilization", startDate, endDate],
    enabled: !!orgId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const response = await fetch(`/api/organizations/${orgId}/resource-utilization?${params}`);
      if (!response.ok) throw new Error("Failed to fetch resource utilization");
      return response.json();
    },
  });
}
