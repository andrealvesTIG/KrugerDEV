import { useQuery } from "@tanstack/react-query";
import type { Project, Task, Issue } from "@shared/schema";

export interface ExternalShare {
  id: number;
  objectType: string;
  objectId: number;
  sourceOrganizationId: number;
  sharedWithUserId: string;
  sharedWithResourceId: number | null;
  accessRole: string;
  sharedBy: string | null;
  sharedAt: string;
  revokedAt: string | null;
}

export interface ExternalProject extends Project {
  isExternal: true;
  sourceOrganizationId: number;
  sourceOrganizationName: string;
  externalShareId: number;
  accessRole: string;
}

export interface ExternalTask extends Task {
  isExternal: true;
  sourceOrganizationId: number;
  sourceOrganizationName: string;
  projectName: string | null;
  externalShareId: number;
  accessRole: string;
}

export interface ExternalRisk extends Issue {
  isExternal: true;
  sourceOrganizationId: number;
  sourceOrganizationName: string;
  projectName: string | null;
  externalShareId: number;
  accessRole: string;
}

export interface ExternalIssue extends Issue {
  isExternal: true;
  sourceOrganizationId: number;
  sourceOrganizationName: string;
  projectName: string | null;
  externalShareId: number;
  accessRole: string;
}

export function useExternalShares() {
  return useQuery<ExternalShare[]>({
    queryKey: ['/api/external-shares'],
    queryFn: async () => {
      const res = await fetch('/api/external-shares', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch external shares");
      return res.json();
    },
  });
}

export function useExternalProjects() {
  return useQuery<ExternalProject[]>({
    queryKey: ['/api/external-projects'],
    queryFn: async () => {
      const res = await fetch('/api/external-projects', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch external projects");
      return res.json();
    },
  });
}

export function useExternalTasks() {
  return useQuery<ExternalTask[]>({
    queryKey: ['/api/external-tasks'],
    queryFn: async () => {
      const res = await fetch('/api/external-tasks', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch external tasks");
      return res.json();
    },
  });
}

export function useExternalRisks() {
  return useQuery<ExternalRisk[]>({
    queryKey: ['/api/external-risks'],
    queryFn: async () => {
      const res = await fetch('/api/external-risks', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch external risks");
      return res.json();
    },
  });
}

export function useExternalIssues() {
  return useQuery<ExternalIssue[]>({
    queryKey: ['/api/external-issues'],
    queryFn: async () => {
      const res = await fetch('/api/external-issues', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch external issues");
      return res.json();
    },
  });
}
