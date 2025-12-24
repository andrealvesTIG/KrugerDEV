import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Task, InsertTask, UpdateTaskRequest } from "@shared/schema";

export function useTasks(projectId: number) {
  return useQuery<Task[]>({
    queryKey: ['/api/projects', projectId, 'tasks'],
    queryFn: () => fetch(`/api/projects/${projectId}/tasks`).then(r => r.json()),
    enabled: projectId > 0,
  });
}

export function useAllTasks() {
  return useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });
}

export function useCreateTask() {
  return useMutation({
    mutationFn: (data: InsertTask) => apiRequest('/api/tasks', 'POST', data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
    },
  });
}

export function useUpdateTask() {
  return useMutation({
    mutationFn: ({ id, projectId, ...data }: { id: number; projectId: number } & UpdateTaskRequest) =>
      apiRequest(`/api/tasks/${id}`, 'PUT', data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
    },
  });
}

export function useDeleteTask() {
  return useMutation({
    mutationFn: ({ id }: { id: number; projectId: number }) =>
      apiRequest(`/api/tasks/${id}`, 'DELETE'),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
    },
  });
}
