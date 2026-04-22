import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Vendor, VendorPrequalification, VendorWithPrequalification, BidPackage, BidInvitation, Bid, BidLineItem } from "@shared/schema";

type BidWithDetails = Bid & {
  vendor: Vendor | null;
  lineItems: BidLineItem[];
};

type BidInvitationWithVendor = BidInvitation & {
  vendor: Vendor | null;
};

type BidLevelingData = {
  bidPackage: BidPackage;
  bids: BidWithDetails[];
  categories: string[];
  summary: {
    totalBids: number;
    lowestBid: number | null;
    highestBid: number | null;
    averageBid: number | null;
    recommendedBid: BidWithDetails | null;
  };
};

export function useVendors(orgId: number | undefined) {
  return useQuery<VendorWithPrequalification[]>({
    queryKey: [`/api/organizations/${orgId}/vendors`],
    enabled: !!orgId,
  });
}

export function useVendor(orgId: number | undefined, vendorId: number | undefined) {
  return useQuery<Vendor>({
    queryKey: [`/api/organizations/${orgId}/vendors/${vendorId}`],
    enabled: !!orgId && !!vendorId,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ orgId, data }: { orgId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/organizations/${orgId}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create vendor" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/organizations/${vars.orgId}/vendors`] });
      toast({ title: "Vendor created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ orgId, vendorId, data }: { orgId: number; vendorId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/organizations/${orgId}/vendors/${vendorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update vendor" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/organizations/${vars.orgId}/vendors`] });
      toast({ title: "Vendor updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ orgId, vendorId }: { orgId: number; vendorId: number }) => {
      const res = await fetch(`/api/organizations/${orgId}/vendors/${vendorId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete vendor" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/organizations/${vars.orgId}/vendors`] });
      toast({ title: "Vendor deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useVendorPrequalifications(orgId: number | undefined, vendorId: number | undefined) {
  return useQuery<VendorPrequalification[]>({
    queryKey: [`/api/organizations/${orgId}/vendors/${vendorId}/prequalifications`],
    enabled: !!orgId && !!vendorId,
  });
}

export function useCreatePrequalification() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ orgId, vendorId, data }: { orgId: number; vendorId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/organizations/${orgId}/vendors/${vendorId}/prequalifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create prequalification" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/organizations/${vars.orgId}/vendors/${vars.vendorId}/prequalifications`] });
      toast({ title: "Prequalification saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdatePrequalification() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ orgId, vendorId, prequalId, data }: { orgId: number; vendorId: number; prequalId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/organizations/${orgId}/vendors/${vendorId}/prequalifications/${prequalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update prequalification" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/organizations/${vars.orgId}/vendors/${vars.vendorId}/prequalifications`] });
      toast({ title: "Prequalification updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useBidPackages(projectId: number | undefined) {
  return useQuery<BidPackage[]>({
    queryKey: [`/api/projects/${projectId}/bid-packages`],
    enabled: !!projectId,
  });
}

export function useBidPackage(projectId: number | undefined, bidPackageId: number | undefined) {
  return useQuery<BidPackage>({
    queryKey: [`/api/projects/${projectId}/bid-packages/${bidPackageId}`],
    enabled: !!projectId && !!bidPackageId,
  });
}

export function useCreateBidPackage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/bid-packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create bid package" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages`] });
      toast({ title: "Bid package created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateBidPackage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, bidPackageId, data }: { projectId: number; bidPackageId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/bid-packages/${bidPackageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update bid package" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages/${vars.bidPackageId}`] });
      toast({ title: "Bid package updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteBidPackage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, bidPackageId }: { projectId: number; bidPackageId: number }) => {
      const res = await fetch(`/api/projects/${projectId}/bid-packages/${bidPackageId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete bid package" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages`] });
      toast({ title: "Bid package deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useBidInvitations(projectId: number | undefined, bidPackageId: number | undefined) {
  return useQuery<BidInvitationWithVendor[]>({
    queryKey: [`/api/projects/${projectId}/bid-packages/${bidPackageId}/invitations`],
    enabled: !!projectId && !!bidPackageId,
  });
}

export function useCreateBidInvitations() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, bidPackageId, vendorIds }: { projectId: number; bidPackageId: number; vendorIds: number[] }) => {
      const res = await fetch(`/api/projects/${projectId}/bid-packages/${bidPackageId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to invite vendors" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages/${vars.bidPackageId}/invitations`] });
      toast({ title: "Vendors invited" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateBidInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, bidPackageId, invitationId, data }: { projectId: number; bidPackageId: number; invitationId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/bid-packages/${bidPackageId}/invitations/${invitationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update invitation" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages/${vars.bidPackageId}/invitations`] });
    },
  });
}

export function useDeleteBidInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, bidPackageId, invitationId }: { projectId: number; bidPackageId: number; invitationId: number }) => {
      const res = await fetch(`/api/projects/${projectId}/bid-packages/${bidPackageId}/invitations/${invitationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to remove invitation" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages/${vars.bidPackageId}/invitations`] });
    },
  });
}

export function useBids(projectId: number | undefined, bidPackageId: number | undefined) {
  return useQuery<BidWithDetails[]>({
    queryKey: [`/api/projects/${projectId}/bid-packages/${bidPackageId}/bids`],
    enabled: !!projectId && !!bidPackageId,
  });
}

export function useCreateBid() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, bidPackageId, data }: { projectId: number; bidPackageId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/bid-packages/${bidPackageId}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create bid" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages/${vars.bidPackageId}/bids`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages/${vars.bidPackageId}/leveling`] });
      toast({ title: "Bid submitted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateBid() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, bidPackageId, bidId, data }: { projectId: number; bidPackageId: number; bidId: number; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/projects/${projectId}/bid-packages/${bidPackageId}/bids/${bidId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update bid" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages/${vars.bidPackageId}/bids`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages/${vars.bidPackageId}/leveling`] });
      toast({ title: "Bid updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteBid() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, bidPackageId, bidId }: { projectId: number; bidPackageId: number; bidId: number }) => {
      const res = await fetch(`/api/projects/${projectId}/bid-packages/${bidPackageId}/bids/${bidId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete bid" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages/${vars.bidPackageId}/bids`] });
      qc.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/bid-packages/${vars.bidPackageId}/leveling`] });
      toast({ title: "Bid deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useBidLeveling(projectId: number | undefined, bidPackageId: number | undefined) {
  return useQuery<BidLevelingData>({
    queryKey: [`/api/projects/${projectId}/bid-packages/${bidPackageId}/leveling`],
    enabled: !!projectId && !!bidPackageId,
  });
}
