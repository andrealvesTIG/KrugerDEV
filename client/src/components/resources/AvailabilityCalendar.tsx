import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChevronLeft, ChevronRight, Plus, Calendar } from "lucide-react";
import { useOrgResourceAvailability, useResources, useAddResourceAvailability, useResourceUtilization } from "@/hooks/use-resources";
import { useToast } from "@/hooks/use-toast";

interface AvailabilityCalendarProps {
  organizationId: number;
}

const AVAILABILITY_TYPES = ["leave", "pto", "sick", "holiday", "training", "other"] as const;

const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  leave: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", label: "Leave" },
  pto: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", label: "PTO" },
  sick: { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-300", label: "Sick" },
  holiday: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", label: "Holiday" },
  training: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", label: "Training" },
  other: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300", label: "Other" },
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatMonth(year: number, month: number): string {
  const date = new Date(year, month);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDateStr(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function isDateInRange(dateStr: string, startDate: string, endDate: string): boolean {
  return dateStr >= startDate && dateStr <= endDate;
}

export default function AvailabilityCalendar({ organizationId }: AvailabilityCalendarProps) {
  const { toast } = useToast();
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formResourceId, setFormResourceId] = useState<string>("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formType, setFormType] = useState<string>("");
  const [formNotes, setFormNotes] = useState("");

  const monthStart = formatDateStr(currentYear, currentMonth, 1);
  const monthEnd = formatDateStr(currentYear, currentMonth, getDaysInMonth(currentYear, currentMonth));

  const { data: availability, isLoading: availLoading } = useOrgResourceAvailability(organizationId, monthStart, monthEnd);
  const { data: resources, isLoading: resourcesLoading } = useResources(organizationId);
  const addAvailability = useAddResourceAvailability();

  const isLoading = availLoading || resourcesLoading;

  const resourceMap = new Map<number, string>();
  if (resources) {
    for (const r of resources) {
      resourceMap.set(r.id, r.displayName || `Resource ${r.id}`);
    }
  }

  function goToPrevMonth() {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  function resetForm() {
    setFormResourceId("");
    setFormStartDate("");
    setFormEndDate("");
    setFormType("");
    setFormNotes("");
  }

  async function handleSubmit() {
    if (!formResourceId || !formStartDate || !formEndDate || !formType) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    try {
      await addAvailability.mutateAsync({
        orgId: organizationId,
        resourceId: parseInt(formResourceId, 10),
        data: {
          organizationId,
          resourceId: parseInt(formResourceId, 10),
          startDate: formStartDate,
          endDate: formEndDate,
          type: formType,
          notes: formNotes || undefined,
        },
      });
      toast({ title: "Time off added", description: "The time-off entry has been created." });
      setDialogOpen(false);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to add time off. Please try again.", variant: "destructive" });
    }
  }

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOffset = getFirstDayOfWeek(currentYear, currentMonth);

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOffset; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d);
  }
  while (calendarCells.length % 7 !== 0) {
    calendarCells.push(null);
  }

  function getEntriesForDay(day: number) {
    if (!availability) return [];
    const dateStr = formatDateStr(currentYear, currentMonth, day);
    return availability.filter((entry) => isDateInRange(dateStr, entry.startDate, entry.endDate));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="loading-spinner">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="availability-calendar">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Availability Calendar</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={goToPrevMonth}
                data-testid="button-prev-month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[140px] text-center" data-testid="text-current-month">
                {formatMonth(currentYear, currentMonth)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={goToNextMonth}
                data-testid="button-next-month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" onClick={() => setDialogOpen(true)} data-testid="button-add-time-off">
              <Plus className="h-4 w-4 mr-1" />
              Add Time Off
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent data-testid="dialog-add-time-off" onPointerDownOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                  <DialogTitle>Add Time Off</DialogTitle>
                  <DialogDescription className="sr-only">Schedule a time-off window for this resource.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="resource-select">Resource</Label>
                    <Select value={formResourceId} onValueChange={setFormResourceId}>
                      <SelectTrigger data-testid="select-resource">
                        <SelectValue placeholder="Select a resource" />
                      </SelectTrigger>
                      <SelectContent>
                        {resources?.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)} data-testid={`select-resource-option-${r.id}`}>
                            {r.displayName || `Resource ${r.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start-date">Start Date</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        data-testid="input-start-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end-date">End Date</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={formEndDate}
                        onChange={(e) => setFormEndDate(e.target.value)}
                        data-testid="input-end-date"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type-select">Type</Label>
                    <Select value={formType} onValueChange={setFormType}>
                      <SelectTrigger data-testid="select-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABILITY_TYPES.map((t) => (
                          <SelectItem key={t} value={t} data-testid={`select-type-option-${t}`}>
                            {TYPE_COLORS[t].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Optional notes..."
                      data-testid="textarea-notes"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleSubmit}
                    disabled={addAvailability.isPending}
                    data-testid="button-submit-time-off"
                  >
                    {addAvailability.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Time Off
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
            {DAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={`text-center text-xs font-medium py-2 ${
                  i >= 5 ? "bg-muted/60" : "bg-muted/30"
                }`}
                data-testid={`header-day-${label.toLowerCase()}`}
              >
                {label}
              </div>
            ))}
            {calendarCells.map((day, idx) => {
              const colIndex = idx % 7;
              const isWeekend = colIndex >= 5;
              const entries = day ? getEntriesForDay(day) : [];
              const today = new Date();
              const isToday =
                day !== null &&
                currentYear === today.getFullYear() &&
                currentMonth === today.getMonth() &&
                day === today.getDate();

              return (
                <div
                  key={idx}
                  className={`min-h-[72px] p-1 ${
                    isWeekend ? "bg-muted/40" : "bg-card"
                  } ${day === null ? "bg-muted/20" : ""}`}
                  data-testid={day ? `cell-day-${day}` : `cell-empty-${idx}`}
                >
                  {day !== null && (
                    <>
                      <div
                        className={`text-xs font-medium mb-0.5 ${
                          isToday
                            ? "text-primary font-bold"
                            : "text-muted-foreground"
                        }`}
                        data-testid={`text-day-number-${day}`}
                      >
                        {day}
                      </div>
                      <div className="flex flex-wrap gap-0.5">
                        {entries.slice(0, 3).map((entry) => {
                          const colors = TYPE_COLORS[entry.type] || TYPE_COLORS.other;
                          const name = resourceMap.get(entry.resourceId) || "??";
                          return (
                            <span
                              key={entry.id}
                              className={`inline-flex items-center justify-center rounded text-[10px] leading-none font-medium px-1 py-0.5 ${colors.bg} ${colors.text}`}
                              title={`${name} - ${colors.label}`}
                              data-testid={`chip-availability-${entry.id}`}
                            >
                              {getInitials(name)}
                            </span>
                          );
                        })}
                        {entries.length > 3 && (
                          <span
                            className="inline-flex items-center justify-center rounded text-[10px] leading-none font-medium px-1 py-0.5 bg-muted text-muted-foreground"
                            data-testid={`chip-more-${day}`}
                          >
                            +{entries.length - 3}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 flex-wrap mt-4 pt-3 border-t" data-testid="legend">
            <span className="text-xs text-muted-foreground font-medium">Legend:</span>
            {Object.entries(TYPE_COLORS).map(([type, colors]) => (
              <div key={type} className="flex items-center gap-1">
                <span className={`inline-block w-3 h-3 rounded-sm ${colors.bg}`} />
                <span className="text-xs text-muted-foreground">{colors.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
