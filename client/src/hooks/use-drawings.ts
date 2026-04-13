import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";

interface Drawing {
  id: number;
  projectId: number;
  organizationId: number;
  drawingNumber: string;
  title: string;
  discipline: string | null;
  status: string;
  description: string | null;
  currentRevisionNumber: number | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
}

interface DrawingRevision {
  id: number;
  drawingId: number;
  revisionNumber: number;
  version: string | null;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  fileType: string | null;
  thumbnailUrl: string | null;
  notes: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string | null;
}

interface DrawingMarkup {
  id: number;
  revisionId: number;
  drawingId: number;
  label: string | null;
  markupData: Array<{
    type: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    points?: Array<{ x: number; y: number }>;
    text?: string;
    color?: string;
    strokeWidth?: number;
  }>;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface DrawingWithRevisions extends Drawing {
  revisions: DrawingRevision[];
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(body.message || "Request failed");
  }
  return res.json();
}

export function useDrawings(projectId: number | undefined, filters?: { discipline?: string; status?: string; search?: string }) {
  return useQuery<Drawing[]>({
    queryKey: ["/api/projects", projectId, "drawings", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.discipline) params.set("discipline", filters.discipline);
      if (filters?.status) params.set("status", filters.status);
      if (filters?.search) params.set("search", filters.search);
      const qs = params.toString();
      return apiFetch(`/api/projects/${projectId}/drawings${qs ? `?${qs}` : ""}`);
    },
    enabled: !!projectId,
  });
}

export function useDrawing(projectId: number | undefined, drawingId: number | undefined) {
  return useQuery<DrawingWithRevisions>({
    queryKey: ["/api/projects", projectId, "drawings", drawingId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/drawings/${drawingId}`),
    enabled: !!projectId && !!drawingId,
  });
}

export function useCreateDrawing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: number; data: { drawingNumber: string; title: string; discipline?: string; description?: string } }) =>
      apiFetch(`/api/projects/${projectId}/drawings`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "drawings"] });
      toast({ title: "Drawing created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateDrawing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ projectId, drawingId, data }: { projectId: number; drawingId: number; data: Record<string, unknown> }) =>
      apiFetch(`/api/projects/${projectId}/drawings/${drawingId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "drawings"] });
      toast({ title: "Drawing updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteDrawing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ projectId, drawingId }: { projectId: number; drawingId: number }) =>
      apiFetch(`/api/projects/${projectId}/drawings/${drawingId}`, { method: "DELETE" }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "drawings"] });
      toast({ title: "Drawing deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDrawingRevisions(projectId: number | undefined, drawingId: number | undefined) {
  return useQuery<DrawingRevision[]>({
    queryKey: ["/api/projects", projectId, "drawings", drawingId, "revisions"],
    queryFn: () => apiFetch(`/api/projects/${projectId}/drawings/${drawingId}/revisions`),
    enabled: !!projectId && !!drawingId,
  });
}

export function useCreateRevision() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ projectId, drawingId, data }: { projectId: number; drawingId: number; data: { fileUrl: string; fileName: string; fileSize?: number; fileType?: string; version?: string; notes?: string } }) =>
      apiFetch(`/api/projects/${projectId}/drawings/${drawingId}/revisions`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "drawings"] });
      toast({ title: "Revision uploaded" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDrawingMarkups(projectId: number | undefined, drawingId: number | undefined, revisionId?: number) {
  return useQuery<DrawingMarkup[]>({
    queryKey: ["/api/projects", projectId, "drawings", drawingId, "markups", revisionId],
    queryFn: () => {
      const params = revisionId ? `?revisionId=${revisionId}` : "";
      return apiFetch(`/api/projects/${projectId}/drawings/${drawingId}/markups${params}`);
    },
    enabled: !!projectId && !!drawingId,
  });
}

export function useSaveMarkup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ projectId, drawingId, data }: { projectId: number; drawingId: number; data: { revisionId: number; label?: string; markupData: unknown[] } }) =>
      apiFetch(`/api/projects/${projectId}/drawings/${drawingId}/markups`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "drawings", variables.drawingId, "markups"] });
      toast({ title: "Markup saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteMarkup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ projectId, drawingId, markupId }: { projectId: number; drawingId: number; markupId: number }) =>
      apiFetch(`/api/projects/${projectId}/drawings/${drawingId}/markups/${markupId}`, { method: "DELETE" }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "drawings", variables.drawingId, "markups"] });
      toast({ title: "Markup deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}
