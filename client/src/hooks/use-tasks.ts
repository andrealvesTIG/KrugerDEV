import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Task, InsertTask, UpdateTaskRequest, TaskChangeLog, TaskNotesHistoryEntry, TaskDependency } from "@shared/schema";
import { toWireDependencyType } from "@/lib/cpm";
import { trackChecklistEvent } from "@/hooks/use-user-journey";
import { format } from "date-fns";

export interface TaskFilterParams {
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  overdue?: boolean;
  sortBy?: 'startDate' | 'endDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export function useTasks(projectId: number) {
  return useQuery<Task[]>({
    queryKey: ['/api/projects', projectId, 'tasks'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/tasks`);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
    enabled: projectId > 0,
  });
}

interface PaginatedTasksResponse {
  tasks: Task[];
  total: number;
  hasMore: boolean;
}

export function useAllTasks(organizationId?: number | null) {
  return useQuery<Task[]>({
    queryKey: ['/api/tasks', 'all', organizationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '10000');
      params.set('offset', '0');
      if (organizationId) params.set('organizationId', String(organizationId));
      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const data = await res.json();
      return Array.isArray(data) ? data : (data.tasks || []);
    },
    enabled: organizationId !== undefined && organizationId !== null,
    staleTime: 60_000,
  });
}

export function usePaginatedTasks(limit: number = 100, organizationId?: number | null, filters?: TaskFilterParams) {
  const query = useInfiniteQuery<PaginatedTasksResponse>({
    queryKey: ['/api/tasks', 'paginated', organizationId, filters],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(pageParam));
      if (organizationId) params.set('organizationId', String(organizationId));
      if (filters?.startDateFrom) params.set('startDateFrom', filters.startDateFrom);
      if (filters?.startDateTo) params.set('startDateTo', filters.startDateTo);
      if (filters?.endDateFrom) params.set('endDateFrom', filters.endDateFrom);
      if (filters?.endDateTo) params.set('endDateTo', filters.endDateTo);
      if (filters?.overdue) {
        params.set('overdue', 'true');
        params.set('today', format(new Date(), 'yyyy-MM-dd'));
      }
      if (filters?.sortBy) params.set('sortBy', filters.sortBy);
      if (filters?.sortOrder) params.set('sortOrder', filters.sortOrder);
      const res = await fetch(`/api/tasks?${params.toString()}`);
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
    enabled: organizationId !== undefined,
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
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'], exact: false });
      trackChecklistEvent('add_task');
      if ((variables as any)?.assigneeId) trackChecklistEvent('assign_member');
    },
  });
}

export function useUpdateTask() {
  return useMutation({
    mutationFn: async ({ id, projectId, ...data }: { id: number; projectId: number } & UpdateTaskRequest) => {
      const res = await apiRequest('PUT', `/api/tasks/${id}`, data);
      return res.json() as Promise<Task & { datesCorrectedByDependency?: boolean }>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'], exact: false });
    },
  });
}

export function useBulkUpdateTasks() {
  return useMutation({
    mutationFn: async (data: {
      taskIds?: number[];
      updates?: Record<string, any>;
      taskUpdates?: Array<{ taskId: number; updates: Record<string, any> }>;
      projectId: number;
    }) => {
      const { projectId, ...body } = data;
      const res = await apiRequest('POST', '/api/tasks/bulk-update', body);
      return res.json() as Promise<{ updatedCount: number }>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'], exact: false });
    },
  });
}

export function useBulkDeleteTasks() {
  return useMutation({
    mutationFn: async (data: { taskIds: number[]; projectId: number }) => {
      const { projectId, ...body } = data;
      const res = await apiRequest('POST', '/api/tasks/bulk-delete', body);
      return res.json() as Promise<{ deletedCount: number }>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'], exact: false });
    },
  });
}

export function useDeleteTask() {
  return useMutation({
    mutationFn: ({ id }: { id: number; projectId: number }) =>
      apiRequest('DELETE', `/api/tasks/${id}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'], exact: false });
    },
  });
}

/**
 * Server reorder semantics (POST /api/projects/:projectId/tasks/reorder):
 *   - Sorts all tasks by current `taskIndex` ascending.
 *   - Removes the moved task ids, splices them at `newIndex` (0-based slot in
 *     the array-without-moved).
 *   - Re-numbers every task so its final 1-based `taskIndex` is `position + 1`.
 *
 * The optimistic update below mirrors that exactly (same clamp, same 1-based
 * re-numbering), so on success the server response is identical to the
 * optimistic state. We therefore only invalidate (without an immediate
 * refetchQueries) on success — the next render or focus event will pick up
 * fresh data without the noticeable mid-drag jump that refetchQueries caused.
 * On error we roll back and force a fresh fetch.
 */
export function useReorderTask() {
  return useMutation({
    mutationFn: ({ projectId, taskId, newIndex, taskIds }: { projectId: number; taskId: number; newIndex: number; taskIds?: number[] }) =>
      apiRequest('POST', `/api/projects/${projectId}/tasks/reorder`, { taskId, newIndex, taskIds }),
    onMutate: async ({ projectId, taskId, newIndex, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });

      const previousTasks = queryClient.getQueryData<Task[]>(['/api/projects', projectId, 'tasks']);

      if (previousTasks) {
        // Match the server: sort by current taskIndex ascending before splicing.
        const sorted = [...previousTasks].sort((a, b) => (a.taskIndex ?? 0) - (b.taskIndex ?? 0));
        const idsToMove = taskIds || [taskId];
        const groupIdSet = new Set(idsToMove);
        const tasksToMove = idsToMove
          .map(id => sorted.find(t => t.id === id))
          .filter(Boolean) as Task[];

        if (tasksToMove.length > 0) {
          const tasksWithoutMoved = sorted.filter(t => !groupIdSet.has(t.id));
          const clampedIndex = Math.max(0, Math.min(newIndex, tasksWithoutMoved.length));
          const newTasks = [...tasksWithoutMoved];
          newTasks.splice(clampedIndex, 0, ...tasksToMove);

          // Server re-numbers to position+1 (1-based). Mirror exactly.
          const updatedTasks = newTasks.map((t, idx) => ({ ...t, taskIndex: idx + 1 }));
          queryClient.setQueryData(['/api/projects', projectId, 'tasks'], updatedTasks);
        }
      }

      return { previousTasks, projectId };
    },
    onError: (_, __, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['/api/projects', context.projectId, 'tasks'], context.previousTasks);
      }
      // After rollback, force a fresh fetch to recover authoritative state.
      if (context?.projectId) {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', context.projectId, 'tasks'] });
      }
    },
    onSuccess: (_, variables) => {
      // Optimistic state already matches server output. Mark stale so the next
      // natural trigger refreshes — but don't force an immediate refetch that
      // would re-render the list and cause a visible "jump".
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', variables.projectId, 'tasks'],
        refetchType: 'none',
      });
    },
  });
}

export function useTaskHistory(taskId: number) {
  return useQuery<TaskChangeLog[]>({
    queryKey: ['/api/tasks', taskId, 'history'],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/history`);
      if (!res.ok) throw new Error('Failed to fetch task history');
      return res.json();
    },
    enabled: taskId > 0,
  });
}

export function useTaskNotesHistory(taskId: number | null) {
  return useQuery<TaskNotesHistoryEntry[]>({
    queryKey: ['/api/tasks', taskId, 'notes-history'],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/notes-history`);
      if (!res.ok) throw new Error('Failed to fetch notes history');
      return res.json();
    },
    enabled: !!taskId && taskId > 0,
  });
}

export function useTaskDependencies(taskId: number) {
  return useQuery<TaskDependency[]>({
    queryKey: ['/api/tasks', taskId, 'dependencies'],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/dependencies`);
      if (!res.ok) throw new Error('Failed to fetch task dependencies');
      return res.json();
    },
    enabled: taskId > 0,
  });
}

export function useAddTaskDependency() {
  return useMutation({
    mutationFn: ({ taskId, dependsOnTaskId, projectId, dependencyType, lagDays }: { 
      taskId: number; 
      dependsOnTaskId: number; 
      projectId?: number;
      dependencyType?: string;
      lagDays?: number;
    }) =>
      apiRequest('POST', `/api/tasks/${taskId}/dependencies`, { 
        dependsOnTaskId,
        ...(dependencyType ? { dependencyType: toWireDependencyType(dependencyType) } : {}),
        ...(lagDays !== undefined ? { lagDays } : {}),
      }),
    onSuccess: (data: any, variables) => {
      queryClient.refetchQueries({ queryKey: ['/api/tasks', variables.taskId, 'dependencies'] });
      if (variables.projectId) {
        queryClient.refetchQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
        queryClient.refetchQueries({ queryKey: ['/api/projects', variables.projectId, 'dependencies'] });
      }
    },
  });
}

export function useUpdateTaskDependency() {
  return useMutation({
    mutationFn: ({ taskId, dependsOnTaskId, dependencyType, lagDays, projectId }: { 
      taskId: number; 
      dependsOnTaskId: number; 
      dependencyType?: string;
      lagDays?: number;
      projectId?: number;
    }) =>
      apiRequest('PUT', `/api/tasks/${taskId}/dependencies/${dependsOnTaskId}`, { 
        ...(dependencyType ? { dependencyType: toWireDependencyType(dependencyType) } : {}),
        ...(lagDays !== undefined ? { lagDays } : {}),
      }),
    onSuccess: (data: any, variables) => {
      queryClient.refetchQueries({ queryKey: ['/api/tasks', variables.taskId, 'dependencies'] });
      if (variables.projectId) {
        queryClient.refetchQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
        queryClient.refetchQueries({ queryKey: ['/api/projects', variables.projectId, 'dependencies'] });
      }
    },
  });
}

export function useRemoveTaskDependency() {
  return useMutation({
    mutationFn: ({ taskId, dependsOnTaskId }: { taskId: number; dependsOnTaskId: number; projectId?: number }) =>
      apiRequest('DELETE', `/api/tasks/${taskId}/dependencies/${dependsOnTaskId}`),
    onSuccess: (_, variables) => {
      queryClient.refetchQueries({ queryKey: ['/api/tasks', variables.taskId, 'dependencies'] });
      if (variables.projectId) {
        queryClient.refetchQueries({ queryKey: ['/api/projects', variables.projectId, 'tasks'] });
        queryClient.refetchQueries({ queryKey: ['/api/projects', variables.projectId, 'dependencies'] });
      }
    },
  });
}

export function useProjectDependencies(projectId: number) {
  return useQuery<TaskDependency[]>({
    queryKey: ['/api/projects', projectId, 'dependencies'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/dependencies`, { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch project dependencies');
      return res.json();
    },
    enabled: projectId > 0,
  });
}
