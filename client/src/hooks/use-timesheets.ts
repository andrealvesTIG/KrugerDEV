import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TimesheetEntry, InsertTimesheetEntry, Task, Resource, Project, TimeCategory, NonProjectTimeEntry, InsertNonProjectTimeEntry, TimesheetPeriod, InsertTimesheetPeriod, TimesheetSettings, TimesheetAuditLog } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export interface TimesheetEntryWithDetails extends TimesheetEntry {
  task?: Task;
  project?: Project;
}

export function useTimesheetEntries(userId: string | undefined, organizationId: number | null, startDate: string, endDate: string) {
  return useQuery<TimesheetEntryWithDetails[]>({
    queryKey: ["/api/timesheets", organizationId, userId, startDate, endDate],
    enabled: !!organizationId && !!userId && !!startDate && !!endDate,
    staleTime: 1000 * 30, // Cache for 30 seconds - timesheet data can change frequently
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

export function useTeamTimesheetEntries(organizationId: number | null, startDate: string, endDate: string) {
  return useQuery<TimesheetEntryWithDetails[]>({
    queryKey: ["/api/timesheets/team", organizationId, startDate, endDate],
    enabled: !!organizationId && !!startDate && !!endDate,
    queryFn: async () => {
      const response = await fetch(`/api/timesheets/team?organizationId=${organizationId}&startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) return [];
      return response.json();
    },
  });
}

export function useAssignedTasks(organizationId: number | null, userId: string | undefined) {
  return useQuery<{ task: Task; project: Project }[]>({
    queryKey: ["/api/timesheets/assigned-tasks", organizationId, userId],
    enabled: !!organizationId && !!userId,
    staleTime: 0, // Always refetch to get latest blocking status
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
    refetchOnMount: true, // Refetch when component mounts
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
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes - resource records rarely change
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
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
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/approval"] });
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
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/timesheets/approval"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
    },
  });
}

export function useBulkApproveTimesheetEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, organizationId }: { ids: number[]; organizationId: number }) => {
      const response = await apiRequest("POST", "/api/timesheets/bulk-approve", { ids, organizationId });
      return response.json() as Promise<{ approved: number }>;
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/timesheets/approval"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
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
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/timesheets/approval"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
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

// Time Categories (non-project time types like Vacation, PTO, Sick Leave)
export function useTimeCategories(organizationId: number | null) {
  return useQuery<TimeCategory[]>({
    queryKey: ["/api/time-categories", organizationId],
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes - categories change rarely
    queryFn: async () => {
      const response = await fetch(`/api/time-categories?organizationId=${organizationId}`);
      if (!response.ok) throw new Error("Failed to fetch time categories");
      return response.json();
    },
  });
}

export interface NonProjectTimeEntryWithCategory {
  entry: NonProjectTimeEntry;
  category: TimeCategory;
}

export function useNonProjectTimeEntries(userId: string | undefined, organizationId: number | null, startDate: string, endDate: string) {
  return useQuery<NonProjectTimeEntryWithCategory[]>({
    queryKey: ["/api/non-project-time", organizationId, userId, startDate, endDate],
    enabled: !!organizationId && !!userId && !!startDate && !!endDate,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const response = await fetch(`/api/non-project-time?organizationId=${organizationId}&startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) throw new Error("Failed to fetch non-project time entries");
      return response.json();
    },
  });
}

export function useCreateNonProjectTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: { organizationId: number; categoryId: number; entryDate: string; hours: number; notes?: string }) => {
      const response = await apiRequest("POST", "/api/non-project-time", entry);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-project-time"] });
    },
  });
}

export function useDeleteNonProjectTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/non-project-time/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-project-time"] });
    },
  });
}

// Timesheet Periods (for closing/locking time periods)
export function useTimesheetPeriods(organizationId: number | null) {
  return useQuery<TimesheetPeriod[]>({
    queryKey: ["/api/timesheet-periods", organizationId],
    enabled: !!organizationId,
    staleTime: 1000 * 60, // Cache for 1 minute
    queryFn: async () => {
      const response = await fetch(`/api/timesheet-periods?organizationId=${organizationId}`);
      if (!response.ok) throw new Error("Failed to fetch timesheet periods");
      return response.json();
    },
  });
}

export function useClosedTimesheetPeriods(organizationId: number | null, startDate: string, endDate: string) {
  return useQuery<TimesheetPeriod[]>({
    queryKey: ["/api/timesheet-periods/closed", organizationId, startDate, endDate],
    enabled: !!organizationId && !!startDate && !!endDate,
    staleTime: 1000 * 30, // Cache for 30 seconds
    queryFn: async () => {
      const response = await fetch(`/api/timesheet-periods/closed?organizationId=${organizationId}&startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) throw new Error("Failed to fetch closed periods");
      return response.json();
    },
  });
}

export function useCreateTimesheetPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (period: { organizationId: number; name: string; startDate: string; endDate: string; notes?: string }) => {
      const response = await apiRequest("POST", "/api/timesheet-periods", period);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheet-periods"] });
    },
  });
}

export function useCloseTimesheetPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/timesheet-periods/${id}/close`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheet-periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheet-periods/closed"] });
    },
  });
}

export function useReopenTimesheetPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/timesheet-periods/${id}/reopen`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheet-periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheet-periods/closed"] });
    },
  });
}

export interface TimesheetReportData {
  totalHours: number;
  totalEntries: number;
  byStatus: Record<string, number>;
  byProject: { projectId: number; projectName: string; hours: number; entries: number }[];
  byWeek: Record<string, number>;
  entries: TimesheetEntryWithDetails[];
}

export function useMyTimesheetReport(organizationId: number | null, userId: string | undefined, startDate: string, endDate: string) {
  return useQuery<TimesheetReportData>({
    queryKey: ["/api/timesheets/my-report", organizationId, userId, startDate, endDate],
    enabled: !!organizationId && !!userId && !!startDate && !!endDate,
    queryFn: async () => {
      const response = await fetch(`/api/timesheets/my-report?organizationId=${organizationId}&startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) throw new Error("Failed to fetch timesheet report");
      return response.json();
    },
  });
}

export function useDeleteTimesheetPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/timesheet-periods/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheet-periods"] });
    },
  });
}

export function useTimesheetSettings(organizationId: number | null) {
  return useQuery<TimesheetSettings>({
    queryKey: ["/api/timesheet-settings", organizationId],
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const response = await fetch(`/api/timesheet-settings?organizationId=${organizationId}`);
      if (!response.ok) throw new Error("Failed to fetch timesheet settings");
      return response.json();
    },
  });
}

export function useUpdateTimesheetSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<TimesheetSettings> & { organizationId: number }) => {
      const response = await apiRequest("PUT", "/api/timesheet-settings", settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheet-settings"] });
    },
  });
}

export function useTimesheetAuditLog(organizationId: number | null, filters?: { entryId?: number; action?: string; limit?: number }) {
  return useQuery<TimesheetAuditLog[]>({
    queryKey: ["/api/timesheet-audit-log", organizationId, filters],
    enabled: !!organizationId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId: String(organizationId) });
      if (filters?.entryId) params.append("entryId", String(filters.entryId));
      if (filters?.action) params.append("action", filters.action);
      if (filters?.limit) params.append("limit", String(filters.limit));
      const response = await fetch(`/api/timesheet-audit-log?${params}`);
      if (!response.ok) throw new Error("Failed to fetch audit log");
      return response.json();
    },
  });
}

export function useTimesheetEntryAuditLog(entryId: number | null) {
  return useQuery<TimesheetAuditLog[]>({
    queryKey: ["/api/timesheet-audit-log/entry", entryId],
    enabled: !!entryId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const response = await fetch(`/api/timesheet-audit-log/entry/${entryId}`);
      if (!response.ok) throw new Error("Failed to fetch entry audit log");
      return response.json();
    },
  });
}

export function useCreateProxyTimesheetEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { organizationId: number; targetResourceId: number; taskId: number; projectId: number; entryDate: string; hours: number; notes?: string }) => {
      const response = await apiRequest("POST", "/api/timesheets/proxy", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
    },
  });
}

export interface ComplianceReportData {
  summary: {
    totalResources: number;
    usersWithEntries: number;
    usersWithNoEntries: number;
    submissionRate: number;
    totalEntries: number;
    totalSubmitted: number;
    totalApproved: number;
    totalRejected: number;
    totalDraft: number;
    approvalRate: number;
    rejectionRate: number;
    overtimeUsers: number;
    overtimeThreshold: number;
    lateSubmissions: number;
    overdueApprovals: number;
  };
  byUser: {
    userId: string;
    resourceName: string;
    totalHours: number;
    entries: number;
    submitted: number;
    approved: number;
    rejected: number;
    draft: number;
    overtime: boolean;
  }[];
}

export function useTimesheetCompliance(organizationId: number | null, startDate: string, endDate: string, filters?: { projectId?: number; resourceId?: number; department?: string }) {
  return useQuery<ComplianceReportData>({
    queryKey: ["/api/timesheet-compliance", organizationId, startDate, endDate, filters],
    enabled: !!organizationId && !!startDate && !!endDate,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const params = new URLSearchParams({
        organizationId: String(organizationId),
        startDate,
        endDate,
      });
      if (filters?.projectId) params.append("projectId", String(filters.projectId));
      if (filters?.resourceId) params.append("resourceId", String(filters.resourceId));
      if (filters?.department) params.append("department", filters.department);
      const response = await fetch(`/api/timesheet-compliance?${params}`);
      if (!response.ok) throw new Error("Failed to fetch compliance report");
      return response.json();
    },
  });
}
