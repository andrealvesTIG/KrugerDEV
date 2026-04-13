import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Submittal, SubmittalRevision } from "@shared/schema";

export interface SubmittalWithRevisions extends Submittal {
  revisions: SubmittalRevision[];
}

export interface AttachmentItem {
  name: string;
  url: string;
  size?: number;
  type?: string;
}

export interface CreateSubmittalInput {
  title: string;
  description?: string | null;
  specSection?: string | null;
  type?: "Product Data" | "Shop Drawings" | "Samples" | "Design Data" | "Test Reports" | "Certificates" | "Manufacturer Instructions" | "Other";
  priority?: "Low" | "Medium" | "High" | "Critical";
  reviewerId?: string | null;
  reviewerName?: string | null;
  submitDate?: string | null;
  requiredDate?: string | null;
  leadTime?: number | null;
  costImpact?: string | null;
  scheduleImpact?: string | null;
  attachments?: AttachmentItem[] | null;
}

export interface UpdateSubmittalInput extends Partial<CreateSubmittalInput> {
  status?: "Pending" | "Under Review" | "Approved" | "Rejected" | "Revise & Resubmit";
}

export interface CreateRevisionInput {
  notes?: string | null;
  status?: "Pending" | "Under Review" | "Approved" | "Rejected" | "Revise & Resubmit";
  attachments?: AttachmentItem[] | null;
}

export interface ReviewRevisionInput {
  status: "Approved" | "Rejected" | "Revise & Resubmit";
  reviewNotes?: string | null;
}

export function useSubmittals(projectId: number, status?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return useQuery<Submittal[]>({
    queryKey: ["/api/projects", projectId, "submittals", status],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/submittals${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch submittals");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useSubmittal(projectId: number, submittalId: number) {
  return useQuery<SubmittalWithRevisions>({
    queryKey: ["/api/projects", projectId, "submittals", submittalId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/submittals/${submittalId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch submittal");
      return res.json();
    },
    enabled: !!projectId && !!submittalId,
  });
}

export function useCreateSubmittal(projectId: number) {
  return useMutation({
    mutationFn: async (data: CreateSubmittalInput) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/submittals`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "submittals"] });
    },
  });
}

export function useUpdateSubmittal(projectId: number) {
  return useMutation({
    mutationFn: async ({ submittalId, data }: { submittalId: number; data: UpdateSubmittalInput }) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/submittals/${submittalId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "submittals"] });
    },
  });
}

export function useDeleteSubmittal(projectId: number) {
  return useMutation({
    mutationFn: async (submittalId: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/submittals/${submittalId}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "submittals"] });
    },
  });
}

export function useCreateSubmittalRevision(projectId: number, submittalId: number) {
  return useMutation({
    mutationFn: async (data: CreateRevisionInput) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/submittals/${submittalId}/revisions`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "submittals", submittalId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "submittals"] });
    },
  });
}

export function useReviewSubmittalRevision(projectId: number, submittalId: number) {
  return useMutation({
    mutationFn: async ({ revisionId, data }: { revisionId: number; data: ReviewRevisionInput }) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/submittals/${submittalId}/revisions/${revisionId}/review`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "submittals", submittalId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "submittals"] });
    },
  });
}
