import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TimesheetEntry, InsertTimesheetEntry, Task, Resource, Project } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export interface TimesheetEntryWithDetails extends TimesheetEntry {
  task?: Task;
  project?: Project;
}

export function useTimesheetEntries(userId: string | undefined, organizationId: number | null, startDate: string, endDate: string) {
  return useQuery<TimesheetEntryWithDetails[]>({
    queryKey: ["/api/timesheets", organizationId, userId, startDate, endDate],
    enabled: !!organizationId && !!userId && !!startDate && !!endDate,
    queryFn: async () => {
      const response = await fetch(`/api/timesheets?organizationId=${organizationId}&startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) throw new Error("Failed to fetch timesheet entries");
      return response.json();
    },
  });
}

export function useTimesheetEntriesForApproval(organizationId: number | null, status?: string) {
  return useQuery<TimesheetEntryWithDetails[]>({
    queryKey: ["/api/timesheets/approval", organizationId, status],
    enabled: !!organizationId,
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId: String(organizationId) });
      if (status) params.append("status", status);
      const response = await fetch(`/api/timesheets/approval?${params}`);
      if (!response.ok) throw new Error("Failed to fetch timesheet entries for approval");
      return response.json();
    },
  });
}

export function useAssignedTasks(organizationId: number | null, userId: string | undefined) {
  return useQuery<{ task: Task; project: Project }[]>({
    queryKey: ["/api/timesheets/assigned-tasks", organizationId, userId],
    enabled: !!organizationId && !!userId,
    queryFn: async () => {
      const response = await fetch(`/api/timesheets/assigned-tasks?organizationId=${organizationId}`);
      if (!response.ok) throw new Error("Failed to fetch assigned tasks");
      return response.json();
    },
  });
}

export function useCurrentUserResource(organizationId: number | null, userId: string | undefined) {
  return useQuery<Resource | null>({
    queryKey: ["/api/timesheets/current-resource", organizationId, userId],
    enabled: !!organizationId && !!userId,
    queryFn: async () => {
      const response = await fetch(`/api/timesheets/current-resource?organizationId=${organizationId}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch current resource");
      }
      return response.json();
    },
  });
}

export function useCreateTimesheetEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: InsertTimesheetEntry) => {
      const response = await apiRequest("POST", "/api/timesheets", entry);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
    },
  });
}

export function useUpdateTimesheetEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<InsertTimesheetEntry> }) => {
      const response = await apiRequest("PUT", `/api/timesheets/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
    },
  });
}

export function useDeleteTimesheetEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/timesheets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
    },
  });
}

export function useSubmitTimesheetWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, startDate, endDate }: { organizationId: number; startDate: string; endDate: string }) => {
      const response = await apiRequest("POST", "/api/timesheets/submit-week", { organizationId, startDate, endDate });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
    },
  });
}

export function useApproveTimesheetEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/timesheets/${id}/approve`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/approval"] });
    },
  });
}

export function useRejectTimesheetEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, rejectionReason }: { id: number; rejectionReason: string }) => {
      const response = await apiRequest("POST", `/api/timesheets/${id}/reject`, { rejectionReason });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/approval"] });
    },
  });
}

export function useBulkUpsertTimesheetEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: (InsertTimesheetEntry & { id?: number })[]) => {
      const response = await apiRequest("POST", "/api/timesheets/bulk", { entries });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
    },
  });
}
