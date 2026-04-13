import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function useCorrespondence(projectId: number) {
  return useQuery({
    queryKey: [`/api/projects/${projectId}/correspondence`],
    enabled: !!projectId,
  });
}

export function useCorrespondenceItem(projectId: number, correspondenceId: number) {
  return useQuery({
    queryKey: [`/api/projects/${projectId}/correspondence/${correspondenceId}`],
    enabled: !!projectId && !!correspondenceId,
  });
}

export function useCreateCorrespondence() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/correspondence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to create correspondence");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/correspondence`] });
      toast({ title: "Correspondence created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateCorrespondence() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, correspondenceId, data }: { projectId: number; correspondenceId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/correspondence/${correspondenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to update correspondence");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/correspondence`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/correspondence/${variables.correspondenceId}`] });
      toast({ title: "Correspondence updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteCorrespondence() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, correspondenceId }: { projectId: number; correspondenceId: number }) => {
      const res = await fetch(`/api/projects/${projectId}/correspondence/${correspondenceId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to delete correspondence");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${variables.projectId}/correspondence`] });
      toast({ title: "Correspondence deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}
