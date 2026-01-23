import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { LessonLearned, InsertLessonLearned } from "@shared/schema";

// Get lessons learned for a project
export function useLessonsLearned(projectId: number | undefined) {
  return useQuery<LessonLearned[]>({
    queryKey: ['/api/projects', projectId, 'lessons-learned'],
    queryFn: () => fetch(`/api/projects/${projectId}/lessons-learned`).then(r => r.json()),
    enabled: !!projectId,
  });
}

// Get all lessons learned for an organization
export function useOrganizationLessonsLearned(organizationId: number | undefined) {
  return useQuery<LessonLearned[]>({
    queryKey: ['/api/organizations', organizationId, 'lessons-learned'],
    queryFn: () => fetch(`/api/organizations/${organizationId}/lessons-learned`).then(r => r.json()),
    enabled: !!organizationId,
  });
}

// Create a lesson learned
export function useCreateLessonLearned() {
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Partial<InsertLessonLearned> }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/lessons-learned`, data);
      return res.json();
    },
    onSuccess: (result, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'lessons-learned'] });
      // Also invalidate organization-level query if we know the org
      if (result.organizationId) {
        queryClient.invalidateQueries({ queryKey: ['/api/organizations', result.organizationId, 'lessons-learned'] });
      }
    },
  });
}

// Update a lesson learned
export function useUpdateLessonLearned() {
  return useMutation({
    mutationFn: async ({ projectId, lessonId, data }: { projectId: number; lessonId: number; data: Partial<InsertLessonLearned> }) => {
      const res = await apiRequest("PUT", `/api/projects/${projectId}/lessons-learned/${lessonId}`, data);
      return res.json();
    },
    onSuccess: (result, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'lessons-learned'] });
      if (result.organizationId) {
        queryClient.invalidateQueries({ queryKey: ['/api/organizations', result.organizationId, 'lessons-learned'] });
      }
    },
  });
}

// Delete a lesson learned
export function useDeleteLessonLearned() {
  return useMutation({
    mutationFn: async ({ projectId, lessonId, organizationId }: { projectId: number; lessonId: number; organizationId?: number }) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/lessons-learned/${lessonId}`);
      return { organizationId };
    },
    onSuccess: (result, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'lessons-learned'] });
      // Also invalidate organization-level query
      if (result?.organizationId) {
        queryClient.invalidateQueries({ queryKey: ['/api/organizations', result.organizationId, 'lessons-learned'] });
      }
    },
  });
}
