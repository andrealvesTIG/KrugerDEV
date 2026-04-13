import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DailyLog } from "@shared/schema";

export interface DailyLogWithDetails extends DailyLog {
  labor: Array<{
    id: number;
    dailyLogId: number;
    company: string | null;
    trade: string | null;
    headcount: number | null;
    hoursWorked: number | null;
    notes: string | null;
  }>;
  equipment: Array<{
    id: number;
    dailyLogId: number;
    equipmentName: string;
    quantity: number | null;
    hoursUsed: number | null;
    status: string | null;
    notes: string | null;
  }>;
}

export interface DailyLogSummary {
  totalDays: number;
  totalLaborHeadcount: number;
  totalLaborHours: number;
  totalEquipmentCount: number;
  totalEquipmentHours: number;
}

export function useDailyLogs(projectId: number, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return useQuery<DailyLog[]>({
    queryKey: ["/api/projects", projectId, "daily-logs", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/daily-logs${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch daily logs");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useDailyLog(projectId: number, logId: number) {
  return useQuery<DailyLogWithDetails>({
    queryKey: ["/api/projects", projectId, "daily-logs", logId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/daily-logs/${logId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch daily log");
      return res.json();
    },
    enabled: !!projectId && !!logId,
  });
}

export function useDailyLogSummary(projectId: number, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return useQuery<DailyLogSummary>({
    queryKey: ["/api/projects", projectId, "daily-logs", "summary", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/daily-logs/summary${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreateDailyLog(projectId: number) {
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/daily-logs`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "daily-logs"] });
    },
  });
}

export function useUpdateDailyLog(projectId: number) {
  return useMutation({
    mutationFn: async ({ logId, data }: { logId: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/daily-logs/${logId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "daily-logs"] });
    },
  });
}

export function useDeleteDailyLog(projectId: number) {
  return useMutation({
    mutationFn: async (logId: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/daily-logs/${logId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "daily-logs"] });
    },
  });
}
