import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { LessonLearned, InsertLessonLearned } from "@shared/schema";

export function useLessonsLearned(projectId: number | undefined) {
  return useQuery<LessonLearned[]>({
    queryKey: ['/api/projects', projectId, 'lessons-learned'],
    enabled: !!projectId,
  });
}

export function useAllLessonsLearned(organizationId: number | undefined) {
  return useQuery<LessonLearned[]>({
    queryKey: ['/api/organizations', organizationId, 'lessons-learned'],
    enabled: !!organizationId,
  });
}

export function useCreateLessonLearned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, organizationId, data }: { 
      projectId: number; 
      organizationId: number; 
      data: Partial<InsertLessonLearned> 
    }) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/lessons-learned`, {
        ...data,
        organizationId
      });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'lessons-learned'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'lessons-learned'] });
    },
  });
}

export function useUpdateLessonLearned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, organizationId, data }: { 
      id: number; 
      projectId: number; 
      organizationId: number; 
      data: Partial<InsertLessonLearned> 
    }) => {
      const res = await apiRequest('PUT', `/api/lessons-learned/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'lessons-learned'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'lessons-learned'] });
    },
  });
}

export function useDeleteLessonLearned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, organizationId }: { id: number; projectId: number; organizationId: number }) => {
      await apiRequest('DELETE', `/api/lessons-learned/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'lessons-learned'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', variables.organizationId, 'lessons-learned'] });
    },
  });
}
