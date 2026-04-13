import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Rfi, RfiResponse } from "@shared/schema";

export interface RfiWithResponses extends Rfi {
  responses: RfiResponse[];
}

export interface CreateRfiInput {
  subject: string;
  question: string;
  priority?: "Low" | "Medium" | "High" | "Critical";
  category?: string | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
  dueDate?: string | null;
  distributionList?: string | null;
  costImpact?: string | null;
  scheduleImpact?: string | null;
  references?: string | null;
}

export interface UpdateRfiInput extends Partial<CreateRfiInput> {
  status?: "Open" | "Answered" | "Closed";
}

export interface CreateRfiResponseInput {
  responseText: string;
  isOfficial?: boolean;
}

export function useRfis(projectId: number, status?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return useQuery<Rfi[]>({
    queryKey: ["/api/projects", projectId, "rfis", status],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/rfis${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch RFIs");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useRfi(projectId: number, rfiId: number) {
  return useQuery<RfiWithResponses>({
    queryKey: ["/api/projects", projectId, "rfis", rfiId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/rfis/${rfiId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch RFI");
      return res.json();
    },
    enabled: !!projectId && !!rfiId,
  });
}

export function useCreateRfi(projectId: number) {
  return useMutation({
    mutationFn: async (data: CreateRfiInput) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/rfis`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfis"] });
    },
  });
}

export function useUpdateRfi(projectId: number) {
  return useMutation({
    mutationFn: async ({ rfiId, data }: { rfiId: number; data: UpdateRfiInput }) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/rfis/${rfiId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfis"] });
    },
  });
}

export function useDeleteRfi(projectId: number) {
  return useMutation({
    mutationFn: async (rfiId: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/rfis/${rfiId}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfis"] });
    },
  });
}

export function useCreateRfiResponse(projectId: number, rfiId: number) {
  return useMutation({
    mutationFn: async (data: CreateRfiResponseInput) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/rfis/${rfiId}/responses`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfis", rfiId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfis"] });
    },
  });
}
