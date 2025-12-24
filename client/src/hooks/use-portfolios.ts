import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreatePortfolioRequest, type UpdatePortfolioRequest } from "@shared/routes";

export function usePortfolios(organizationId?: number | null) {
  return useQuery({
    queryKey: [api.portfolios.list.path, organizationId],
    queryFn: async () => {
      let url = api.portfolios.list.path;
      if (organizationId) {
        url += `?organizationId=${organizationId}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch portfolios");
      return api.portfolios.list.responses[200].parse(await res.json());
    },
  });
}

export function usePortfolio(id: number) {
  return useQuery({
    queryKey: [api.portfolios.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.portfolios.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch portfolio");
      return api.portfolios.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreatePortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePortfolioRequest) => {
      const res = await fetch(api.portfolios.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create portfolio");
      return api.portfolios.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.portfolios.list.path] }),
  });
}

export function useUpdatePortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: UpdatePortfolioRequest & { id: number }) => {
      const url = buildUrl(api.portfolios.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update portfolio");
      return api.portfolios.update.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.portfolios.list.path] }),
  });
}

export function useDeletePortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.portfolios.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete portfolio");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.portfolios.list.path] }),
  });
}
