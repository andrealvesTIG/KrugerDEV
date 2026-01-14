import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Task, InsertTask, UpdateTaskRequest, TaskChangeLog, TaskDependency } from "@shared/schema";

export function useTasks(projectId: number) {
  return useQuery<Task[]>({
    queryKey: ['/api/projects', projectId, 'tasks'],
    queryFn: () => fetch(`/api/projects/${projectId}/tasks`).then(r => r.json()),
    enabled: projectId > 0,
  });
}

interface PaginatedTasksResponse {
  tasks: Task[];
  total: number;
  hasMore: boolean;
}

export function useAllTasks() {
  return useQuery<Task[]>({
    queryKey: ['/api/tasks', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/tasks?limit=10000&offset=0');
      if (!res.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const data = await res.json();
      // Handle both old array format and new paginated format
      return Array.isArray(data) ? data : (data.tasks || []);
    },
  });
}

export function usePaginatedTasks(limit: number = 100) {
  const query = useInfiniteQuery<PaginatedTasksResponse>({
    queryKey: ['/api/tasks', 'paginated'],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await fetch(`/api/tasks?limit=${limit}&offset=${pageParam}`);
      if (!res.ok) {
        throw new Error('Failed to fetch tasks');
      }
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length * limit;
    },
  });

  // Flatten all pages into a single tasks array
  const tasks = query.data?.pages.flatMap(page => page.tasks) || [];
  const total = query.data?.pages[0]?.total || 0;
  const hasMore = query.hasNextPage || false;

  return {
    tasks,
    total,
    hasMore,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    error: query.error,
    loadMore: query.fetchNextPage,
    refetch: query.refetch,
  };
}

export function useCreateTask() {
  return useMutation({
    mutationFn: async (data: InsertTask) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Failed to create task' }));
        const error = new Error(errorData.message || 'Failed to create task') as any;
        error.limitExceeded = errorData.limitExceeded;
        error.resourceType = errorData.resourceType;
        throw error;
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
      // Invalidate and immediately refetch all task queries
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'], exact: false, refetchType: 'all' });
    },
  });
}

export function useUpdateTask() {
  return useMutation({
    mutationFn: ({ id, projectId, ...data }: { id: number; projectId: number } & UpdateTaskRequest) =>
      apiRequest('PUT', `/api/tasks/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
      // Invalidate and immediately refetch all task queries
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'], exact: false, refetchType: 'all' });
    },
  });
}

export function useDeleteTask() {
  return useMutation({
    mutationFn: ({ id }: { id: number; projectId: number }) =>
      apiRequest('DELETE', `/api/tasks/${id}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
      // Invalidate and immediately refetch all task queries
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'], exact: false, refetchType: 'all' });
    },
  });
}

export function useTaskHistory(taskId: number) {
  return useQuery<TaskChangeLog[]>({
    queryKey: ['/api/tasks', taskId, 'history'],
    queryFn: () => fetch(`/api/tasks/${taskId}/history`).then(r => r.json()),
    enabled: taskId > 0,
  });
}

export function useTaskDependencies(taskId: number) {
  return useQuery<TaskDependency[]>({
    queryKey: ['/api/tasks', taskId, 'dependencies'],
    queryFn: () => fetch(`/api/tasks/${taskId}/dependencies`).then(r => r.json()),
    enabled: taskId > 0,
  });
}

export function useAddTaskDependency() {
  return useMutation({
    mutationFn: ({ taskId, dependsOnTaskId }: { taskId: number; dependsOnTaskId: number }) =>
      apiRequest('POST', `/api/tasks/${taskId}/dependencies`, { dependsOnTaskId }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', variables.taskId, 'dependencies'] });
    },
  });
}

export function useRemoveTaskDependency() {
  return useMutation({
    mutationFn: ({ taskId, dependsOnTaskId }: { taskId: number; dependsOnTaskId: number }) =>
      apiRequest('DELETE', `/api/tasks/${taskId}/dependencies/${dependsOnTaskId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', variables.taskId, 'dependencies'] });
    },
  });
}
