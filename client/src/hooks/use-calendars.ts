import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  Calendar,
  CalendarException,
  CalendarRecurringException,
  CalendarWorkingShift,
  InsertCalendar,
  InsertCalendarException,
  InsertCalendarRecurringException,
  UpdateCalendarRequest,
  UpdateCalendarExceptionRequest,
  UpdateCalendarRecurringExceptionRequest,
} from "@shared/schema";

export type CalendarDetailResponse = Calendar & {
  shifts: CalendarWorkingShift[];
  exceptions: CalendarException[];
  recurring: CalendarRecurringException[];
};

export function useCalendars(organizationId?: number, includeInactive = false) {
  return useQuery<Calendar[]>({
    queryKey: [`/api/organizations/${organizationId}/calendars`, includeInactive],
    queryFn: async () => {
      const url = `/api/organizations/${organizationId}/calendars${includeInactive ? "?includeInactive=true" : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch calendars");
      return res.json();
    },
    enabled: !!organizationId,
  });
}

export function useCalendar(id: number | undefined) {
  return useQuery<CalendarDetailResponse | null>({
    queryKey: [`/api/calendars/${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/calendars/${id}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch calendar");
      return res.json();
    },
    enabled: !!id,
  });
}

function invalidateCalendar(qc: ReturnType<typeof useQueryClient>, id?: number, organizationId?: number) {
  if (id) qc.invalidateQueries({ queryKey: [`/api/calendars/${id}`] });
  if (organizationId) qc.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/calendars`] });
}

export function useCreateCalendar(organizationId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertCalendar) => {
      const res = await apiRequest("POST", "/api/calendars", data);
      return (await res.json()) as Calendar;
    },
    onSuccess: () => invalidateCalendar(qc, undefined, organizationId),
  });
}

export function useUpdateCalendar(organizationId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: UpdateCalendarRequest }) => {
      const res = await apiRequest("PUT", `/api/calendars/${id}`, updates);
      return (await res.json()) as Calendar;
    },
    onSuccess: (_d, vars) => invalidateCalendar(qc, vars.id, organizationId),
  });
}

export function useDeleteCalendar(organizationId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/calendars/${id}`);
    },
    onSuccess: () => invalidateCalendar(qc, undefined, organizationId),
  });
}

export function useReplaceWorkingWeek(calendarId: number, organizationId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (shifts: Array<{ dayOfWeek: number; startMinute: number; endMinute: number; position?: number }>) => {
      const res = await apiRequest("PUT", `/api/calendars/${calendarId}/working-week`, { shifts });
      return (await res.json()) as CalendarWorkingShift[];
    },
    onSuccess: () => invalidateCalendar(qc, calendarId, organizationId),
  });
}

export function useCreateException(calendarId: number, organizationId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<InsertCalendarException, "calendarId">) => {
      const res = await apiRequest("POST", `/api/calendars/${calendarId}/exceptions`, data);
      return (await res.json()) as CalendarException;
    },
    onSuccess: () => invalidateCalendar(qc, calendarId, organizationId),
  });
}

export function useUpdateException(calendarId: number, organizationId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: UpdateCalendarExceptionRequest }) => {
      const res = await apiRequest("PUT", `/api/calendar-exceptions/${id}`, updates);
      return (await res.json()) as CalendarException;
    },
    onSuccess: () => invalidateCalendar(qc, calendarId, organizationId),
  });
}

export function useDeleteException(calendarId: number, organizationId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/calendar-exceptions/${id}`);
    },
    onSuccess: () => invalidateCalendar(qc, calendarId, organizationId),
  });
}

export function useCreateRecurringException(calendarId: number, organizationId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<InsertCalendarRecurringException, "calendarId">) => {
      const res = await apiRequest("POST", `/api/calendars/${calendarId}/recurring-exceptions`, data);
      return (await res.json()) as CalendarRecurringException;
    },
    onSuccess: () => invalidateCalendar(qc, calendarId, organizationId),
  });
}

export function useUpdateRecurringException(calendarId: number, organizationId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: UpdateCalendarRecurringExceptionRequest }) => {
      const res = await apiRequest("PUT", `/api/calendar-recurring-exceptions/${id}`, updates);
      return (await res.json()) as CalendarRecurringException;
    },
    onSuccess: () => invalidateCalendar(qc, calendarId, organizationId),
  });
}

export function useDeleteRecurringException(calendarId: number, organizationId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/calendar-recurring-exceptions/${id}`);
    },
    onSuccess: () => invalidateCalendar(qc, calendarId, organizationId),
  });
}

export type SimulatePayload =
  | { mode: "finish_from_start"; startDate: string; hours: number }
  | { mode: "start_from_finish"; startDate: string; hours: number }
  | { mode: "hours_between"; startDate: string; finishDate: string }
  | { mode: "next_working_moment"; startDate: string };

export function useSimulateCalendar(calendarId: number) {
  return useMutation({
    mutationFn: async (payload: SimulatePayload) => {
      const res = await apiRequest("POST", `/api/calendars/${calendarId}/simulate`, payload);
      return res.json();
    },
  });
}
