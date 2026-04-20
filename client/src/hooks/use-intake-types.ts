import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { IntakeType, InsertIntakeType } from "@shared/schema";

export function useIntakeTypes(organizationId?: number) {
  return useQuery<IntakeType[]>({
    queryKey: ["/api/intake-types", organizationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/intake-types?organizationId=${organizationId}`);
      if (!res.ok) throw new Error("Failed to load intake types");
      return res.json();
    },
    enabled: !!organizationId,
  });
}

export function useCreateIntakeType() {
  return useMutation({
    mutationFn: async (data: Partial<InsertIntakeType> & { organizationId: number; name: string }) => {
      const res = await apiRequest("POST", "/api/intake-types", data);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed to create intake type");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-types"] }),
  });
}

export function useUpdateIntakeType() {
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertIntakeType>) => {
      const res = await apiRequest("PUT", `/api/intake-types/${id}`, updates);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed to update intake type");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-types"] }),
  });
}

export function useDeleteIntakeType() {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/intake-types/${id}`);
      if (!res.ok && res.status !== 204) {
        throw new Error((await res.json().catch(() => ({}))).message || "Failed to delete intake type");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-types"] }),
  });
}
