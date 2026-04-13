import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function useMeetings(projectId: number) {
  return useQuery({
    queryKey: [`/api/projects/${projectId}/meetings`],
    enabled: !!projectId,
  });
}

export function useMeeting(projectId: number, meetingId: number) {
  return useQuery({
    queryKey: [`/api/projects/${projectId}/meetings/${meetingId}`],
    enabled: !!projectId && !!meetingId,
  });
}

export function useMeetingActionItems(projectId: number) {
  return useQuery({
    queryKey: [`/api/projects/${projectId}/meetings/action-items`],
    enabled: !!projectId,
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to create meeting");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings`] });
      toast({ title: "Meeting created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, meetingId, data }: { projectId: number; meetingId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to update meeting");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings/${variables.meetingId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings/action-items`] });
      toast({ title: "Meeting updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, meetingId }: { projectId: number; meetingId: number }) => {
      const res = await fetch(`/api/projects/${projectId}/meetings/${meetingId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to delete meeting");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings/action-items`] });
      toast({ title: "Meeting deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useCreateActionItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, meetingId, data }: { projectId: number; meetingId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/meetings/${meetingId}/action-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to create action item");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings/${variables.meetingId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings/action-items`] });
      toast({ title: "Action item created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateActionItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, meetingId, actionItemId, data }: { projectId: number; meetingId: number; actionItemId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/meetings/${meetingId}/action-items/${actionItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to update action item");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings/${variables.meetingId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings/action-items`] });
      toast({ title: "Action item updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteActionItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, meetingId, actionItemId }: { projectId: number; meetingId: number; actionItemId: number }) => {
      const res = await fetch(`/api/projects/${projectId}/meetings/${meetingId}/action-items/${actionItemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to delete action item");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings/${variables.meetingId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/meetings/action-items`] });
      toast({ title: "Action item deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}
