import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import type { Organization, OrganizationMember } from "@shared/schema";

interface OrganizationContextType {
  currentOrganization: Organization | null;
  setCurrentOrganization: (org: Organization | null) => void;
  organizations: Organization[];
  memberships: OrganizationMember[];
  isLoading: boolean;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);

  // Prefetch assigned tasks when organization changes for faster Timesheets/My Assignments
  useEffect(() => {
    if (currentOrganization && user?.id) {
      queryClient.prefetchQuery({
        queryKey: ["/api/timesheets/assigned-tasks", currentOrganization.id, user.id],
        queryFn: async () => {
          const response = await fetch(`/api/timesheets/assigned-tasks?organizationId=${currentOrganization.id}`);
          if (!response.ok) throw new Error("Failed to fetch assigned tasks");
          return response.json();
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
      });
      // Also prefetch current user resource for timesheets
      queryClient.prefetchQuery({
        queryKey: ["/api/timesheets/current-resource", currentOrganization.id, user.id],
        queryFn: async () => {
          const response = await fetch(`/api/timesheets/current-resource?organizationId=${currentOrganization.id}`);
          if (!response.ok) return null;
          return response.json();
        },
        staleTime: 1000 * 60 * 10, // 10 minutes
      });
    }
  }, [currentOrganization, user?.id, queryClient]);

  const { data: memberships = [], isLoading: membershipsLoading } = useQuery<OrganizationMember[]>({
    queryKey: ['/api/users', user?.id, 'organizations'],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/users/${user.id}/organizations`);
      return res.json();
    },
    enabled: !!user?.id
  });

  const { data: allOrganizations = [], isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ['/api/organizations']
  });

  // All users can see all organizations
  const organizations = allOrganizations;

  // Auto-select first org if none selected
  useEffect(() => {
    if (!currentOrganization && organizations.length > 0) {
      const savedOrgId = localStorage.getItem('currentOrgId');
      const savedOrg = savedOrgId ? organizations.find(o => o.id === Number(savedOrgId)) : null;
      setCurrentOrganization(savedOrg || organizations[0]);
    }
  }, [organizations, currentOrganization]);

  // Persist selection
  useEffect(() => {
    if (currentOrganization) {
      localStorage.setItem('currentOrgId', String(currentOrganization.id));
    }
  }, [currentOrganization]);

  // Sync currentOrganization with fresh data from organizations list
  useEffect(() => {
    if (currentOrganization && organizations.length > 0) {
      const updatedOrg = organizations.find(o => o.id === currentOrganization.id);
      if (updatedOrg) {
        // Only update if data actually changed (compare stringified to avoid infinite loops)
        const currentStr = JSON.stringify(currentOrganization);
        const updatedStr = JSON.stringify(updatedOrg);
        if (currentStr !== updatedStr) {
          setCurrentOrganization(updatedOrg);
        }
      }
    }
  }, [organizations, currentOrganization]);

  return (
    <OrganizationContext.Provider value={{
      currentOrganization,
      setCurrentOrganization,
      organizations,
      memberships,
      isLoading: membershipsLoading || orgsLoading
    }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return context;
}
