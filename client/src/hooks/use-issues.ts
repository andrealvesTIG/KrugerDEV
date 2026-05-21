import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { CreateIssueRequest, UpdateIssueRequest, IssueChangeLog } from "@shared/schema";

export function useIssues(
  projectId: number,
  pagination?: { page?: number; pageSize?: number },
) {
  const { page, pageSize } = pagination ?? {};
  return useQuery({
    queryKey: [api.issues.list.path, projectId, page ?? null, pageSize ?? null],
    queryFn: async () => {
      const base = buildUrl(api.issues.list.path, { projectId });
      const qs = new URLSearchParams();
      if (page !== undefined) qs.set("page", String(page));
      if (pageSize !== undefined) qs.set("pageSize", String(Math.min(200, pageSize)));
      const url = qs.toString() ? `${base}?${qs.toString()}` : base;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch issues");
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json?.data ?? []);
      return api.issues.list.responses[200].parse(list);
    },
    enabled: !!projectId,
  });
}

export function useAllIssues(organizationId?: number) {
  return useQuery({
    queryKey: [api.issues.listAll.path, organizationId],
    queryFn: async () => {
      const url = organizationId 
        ? `${api.issues.listAll.path}?organizationId=${organizationId}` 
        : api.issues.listAll.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch issues");
      return api.issues.listAll.responses[200].parse(await res.json());
    },
    enabled: !!organizationId,
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateIssueRequest) => {
      const res = await fetch(api.issues.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error = new Error(errorData.message || "Failed to create issue") as any;
        error.limitExceeded = errorData.limitExceeded;
        error.resourceType = errorData.resourceType;
        throw error;
      }
      return api.issues.create.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.issues.list.path, data.projectId] });
      queryClient.invalidateQueries({ queryKey: [api.issues.listAll.path] });
    },
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, ...data }: UpdateIssueRequest & { id: number; projectId: number }) => {
      const url = buildUrl(api.issues.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update issue");
      const result = api.issues.update.responses[200].parse(await res.json());
      return { ...result, _projectId: projectId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.issues.list.path, data._projectId || data.projectId] });
      queryClient.invalidateQueries({ queryKey: [api.issues.listAll.path] });
    },
  });
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: number; projectId: number }) => {
      const url = buildUrl(api.issues.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete issue");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.issues.list.path, variables.projectId] });
      queryClient.invalidateQueries({ queryKey: [api.issues.listAll.path] });
    },
  });
}

export function useIssueHistory(issueId: number) {
  return useQuery<IssueChangeLog[]>({
    queryKey: ['/api/issues', issueId, 'history'],
    queryFn: async () => {
      const res = await fetch(`/api/issues/${issueId}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch issue history");
      return res.json();
    },
    enabled: issueId > 0,
  });
}

export function useEscalateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, escalate }: { id: number; projectId: number; escalate: boolean }) => {
      const res = await fetch(`/api/issues/${id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escalate }),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update escalation status");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.issues.list.path, variables.projectId] });
      queryClient.invalidateQueries({ queryKey: [api.issues.listAll.path] });
    },
  });
}
