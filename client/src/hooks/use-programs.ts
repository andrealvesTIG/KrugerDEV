import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { InsertProgram, Program, Project, UpdateProgramRequest } from "@shared/schema";

export function usePrograms(organizationId?: number | null) {
  return useQuery<Program[]>({
    queryKey: ["/api/programs", organizationId ?? null],
    queryFn: async () => {
      const url = organizationId ? `/api/programs?organizationId=${organizationId}` : "/api/programs";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch programs");
      return res.json();
    },
  });
}

export function useProgram(id: number | undefined) {
  return useQuery<Program | null>({
    queryKey: ["/api/programs", id],
    queryFn: async () => {
      const res = await fetch(`/api/programs/${id}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch program");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useProgramProjects(id: number | undefined) {
  return useQuery<Project[]>({
    queryKey: ["/api/programs", id, "projects"],
    queryFn: async () => {
      const res = await fetch(`/api/programs/${id}/projects`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch program projects");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertProgram): Promise<Program> => {
      const res = await apiRequest("POST", "/api/programs", data);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/programs"] }),
  });
}

export function useUpdateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateProgramRequest & { id: number }): Promise<Program> => {
      const res = await apiRequest("PUT", `/api/programs/${id}`, data);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/programs"] });
      qc.invalidateQueries({ queryKey: ["/api/programs", vars.id] });
    },
  });
}

export function useDeleteProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/programs/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/programs"] }),
  });
}

export function useSetProgramProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectIds }: { id: number; projectIds: number[] }) => {
      const res = await apiRequest("PUT", `/api/programs/${id}/projects`, { projectIds });
      return res.json();
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/programs", vars.id, "projects"] });
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });
}
