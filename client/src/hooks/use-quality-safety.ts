import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type {
  InspectionTemplate, Inspection, InspectionResult,
  Incident, IncidentAction,
  Observation, ObservationAction,
  InspectionTemplateItem,
} from "@shared/schema";

export function useInspectionTemplates(projectId: number) {
  return useQuery<InspectionTemplate[]>({
    queryKey: [`/api/projects/${projectId}/inspection-templates`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/inspection-templates`);
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useInspectionTemplate(projectId: number, templateId: number) {
  return useQuery<InspectionTemplate & { items: InspectionTemplateItem[] }>({
    queryKey: [`/api/projects/${projectId}/inspection-templates/${templateId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/inspection-templates/${templateId}`);
      return res.json();
    },
    enabled: !!projectId && !!templateId,
  });
}

export function useCreateInspectionTemplate(projectId: number) {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/inspection-templates`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/inspection-templates`] });
    },
  });
}

export function useDeleteInspectionTemplate(projectId: number) {
  return useMutation({
    mutationFn: async (templateId: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/inspection-templates/${templateId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/inspection-templates`] });
    },
  });
}

export function useInspections(projectId: number, filters?: Record<string, string>) {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
  }
  const qs = params.toString();
  return useQuery<Inspection[]>({
    queryKey: [`/api/projects/${projectId}/inspections`, qs],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/inspections${qs ? `?${qs}` : ""}`);
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useInspection(projectId: number, inspectionId: number) {
  return useQuery<Inspection & { results: InspectionResult[] }>({
    queryKey: [`/api/projects/${projectId}/inspections/${inspectionId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/inspections/${inspectionId}`);
      return res.json();
    },
    enabled: !!projectId && !!inspectionId,
  });
}

export function useCreateInspection(projectId: number) {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/inspections`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/inspections`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useUpdateInspection(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/inspections/${id}`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/inspections`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/inspections/${variables.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useDeleteInspection(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/inspections/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/inspections`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useSaveInspectionResults(projectId: number, inspectionId: number) {
  return useMutation({
    mutationFn: async (results: Record<string, unknown>[]) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/inspections/${inspectionId}/results`, { results });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/inspections/${inspectionId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/inspections`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useIncidents(projectId: number, filters?: Record<string, string>) {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
  }
  const qs = params.toString();
  return useQuery<Incident[]>({
    queryKey: [`/api/projects/${projectId}/incidents`, qs],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/incidents${qs ? `?${qs}` : ""}`);
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useIncident(projectId: number, incidentId: number) {
  return useQuery<Incident & { actions: IncidentAction[] }>({
    queryKey: [`/api/projects/${projectId}/incidents/${incidentId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/incidents/${incidentId}`);
      return res.json();
    },
    enabled: !!projectId && !!incidentId,
  });
}

export function useCreateIncident(projectId: number) {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/incidents`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/incidents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useUpdateIncident(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/incidents/${id}`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/incidents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/incidents/${variables.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useDeleteIncident(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/incidents/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/incidents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useCreateIncidentAction(projectId: number, incidentId: number) {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/incidents/${incidentId}/actions`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/incidents/${incidentId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useUpdateIncidentAction(projectId: number, incidentId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/incidents/${incidentId}/actions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/incidents/${incidentId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useObservations(projectId: number, filters?: Record<string, string>) {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
  }
  const qs = params.toString();
  return useQuery<Observation[]>({
    queryKey: [`/api/projects/${projectId}/observations`, qs],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/observations${qs ? `?${qs}` : ""}`);
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useObservation(projectId: number, observationId: number) {
  return useQuery<Observation & { actions: ObservationAction[] }>({
    queryKey: [`/api/projects/${projectId}/observations/${observationId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/observations/${observationId}`);
      return res.json();
    },
    enabled: !!projectId && !!observationId,
  });
}

export function useCreateObservation(projectId: number) {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/observations`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/observations`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useUpdateObservation(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/observations/${id}`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/observations`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/observations/${variables.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useDeleteObservation(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/observations/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/observations`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useCreateObservationAction(projectId: number, observationId: number) {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/observations/${observationId}/actions`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/observations/${observationId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export function useUpdateObservationAction(projectId: number, observationId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/observations/${observationId}/actions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/observations/${observationId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/safety-dashboard`] });
    },
  });
}

export interface TrendDataPoint {
  week: string;
  inspections: number;
  incidents: number;
  observations: number;
}

export interface SafetyDashboardData {
  inspections: { counts: Record<string, number>; total: number; completionRate: number };
  incidents: { counts: Record<string, number>; total: number };
  observations: { counts: Record<string, number>; total: number };
  incidentsBySeverity: { counts: Record<string, number>; total: number };
  observationsByCategory: { counts: Record<string, number>; total: number };
  openCorrectiveActions: number;
  trends: TrendDataPoint[];
}

export function useSafetyDashboard(projectId: number) {
  return useQuery<SafetyDashboardData>({
    queryKey: [`/api/projects/${projectId}/safety-dashboard`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/safety-dashboard`);
      return res.json();
    },
    enabled: !!projectId,
  });
}
