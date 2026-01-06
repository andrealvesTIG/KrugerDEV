import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProjectDocument, InsertProjectDocument, UpdateProjectDocumentRequest } from "@shared/schema";

export function useProjectDocuments(projectId: number) {
  return useQuery<ProjectDocument[]>({
    queryKey: ['/api/projects', projectId, 'documents'],
    enabled: !!projectId,
  });
}

export function useCreateProjectDocument(projectId: number) {
  return useMutation({
    mutationFn: async (data: Omit<InsertProjectDocument, 'projectId' | 'uploadedBy'>) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/documents`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'documents'] });
    },
  });
}

export function useUpdateProjectDocument(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateProjectDocumentRequest }) => {
      const res = await apiRequest('PATCH', `/api/documents/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'documents'] });
    },
  });
}

export function useDeleteProjectDocument(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/documents/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'documents'] });
    },
  });
}
